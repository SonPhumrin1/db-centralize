package executor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/restrequest"
)

const (
	NodeTypeSource           = "source"
	NodeTypeFilter           = "filter"
	NodeTypeTransform        = "transform"
	NodeTypeJoin             = "join"
	NodeTypeOutput           = "output"
	NodeTypeTelegramTrigger  = "telegram-trigger"
	NodeTypeTelegramTemplate = "telegram-template"
	NodeTypeTelegramSend     = "telegram-send"
)

var (
	ErrInvalidCanvas          = errors.New("invalid pipeline canvas")
	ErrPipelineCycleDetected  = errors.New("pipeline contains a cycle")
	ErrMissingOutputNode      = errors.New("pipeline requires an output node")
	ErrMissingSourceExecution = errors.New("source node requires a query or path")
	ErrTelegramTriggerNoMatch = errors.New("telegram trigger did not match the incoming message")
	telegramPlaceholderRE     = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_\.:-]+)\s*\}\}`)
)

type SourceResolver func(ctx context.Context, id, userID uint) (*model.DataSource, error)
type DBRunner func(ctx context.Context, source model.DataSource, queryBody string) ([]map[string]any, error)
type RESTRunner func(ctx context.Context, source model.DataSource, request restrequest.Request) ([]map[string]any, error)
type TelegramIntegrationResolver func(ctx context.Context, id, userID uint) (*model.TelegramIntegration, error)
type TelegramSender func(ctx context.Context, integration model.TelegramIntegration, message TelegramMessage) (map[string]any, error)

type PipelineExecutor struct {
	ResolveSource              SourceResolver
	RunDB                      DBRunner
	RunREST                    RESTRunner
	ResolveTelegramIntegration TelegramIntegrationResolver
	SendTelegram               TelegramSender
}

type ExecuteOptions struct {
	Manual         bool
	TelegramEvents map[uint][]map[string]any
}

type TelegramMessage struct {
	ChatID    string
	Text      string
	ParseMode string
}

type Canvas struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type Node struct {
	ID   string   `json:"id"`
	Type string   `json:"type"`
	Data NodeData `json:"data"`
}

type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

type NodeData struct {
	Label                 string            `json:"label,omitempty"`
	SourceID              uint              `json:"sourceId,omitempty"`
	QueryBody             string            `json:"queryBody,omitempty"`
	RESTMethod            string            `json:"restMethod,omitempty"`
	RESTPath              string            `json:"restPath,omitempty"`
	RESTQueryParams       map[string]string `json:"restQueryParams,omitempty"`
	RESTHeaders           map[string]string `json:"restHeaders,omitempty"`
	RESTBody              string            `json:"restBody,omitempty"`
	Column                string            `json:"column,omitempty"`
	Operator              string            `json:"operator,omitempty"`
	Value                 string            `json:"value,omitempty"`
	Mappings              []ColumnMapping   `json:"mappings,omitempty"`
	JoinKey               string            `json:"joinKey,omitempty"`
	JoinType              string            `json:"joinType,omitempty"`
	ExposeAsEndpoint      bool              `json:"exposeAsEndpoint,omitempty"`
	EndpointName          string            `json:"endpointName,omitempty"`
	TelegramIntegrationID uint              `json:"telegramIntegrationId,omitempty"`
	TriggerCommand        string            `json:"triggerCommand,omitempty"`
	TriggerTextContains   string            `json:"triggerTextContains,omitempty"`
	MockEventJSON         string            `json:"mockEventJson,omitempty"`
	Template              string            `json:"template,omitempty"`
	MessageField          string            `json:"messageField,omitempty"`
	ParseMode             string            `json:"parseMode,omitempty"`
	ChatID                string            `json:"chatId,omitempty"`
}

type ColumnMapping struct {
	Original string `json:"original"`
	New      string `json:"new"`
	Drop     bool   `json:"drop"`
}

func ParseCanvas(raw string) (Canvas, error) {
	if strings.TrimSpace(raw) == "" {
		return Canvas{}, ErrInvalidCanvas
	}

	var canvas Canvas
	if err := json.Unmarshal([]byte(raw), &canvas); err != nil {
		return Canvas{}, fmt.Errorf("%w: %v", ErrInvalidCanvas, err)
	}

	return canvas, nil
}

func FirstPublishedOutputName(rawCanvas string, fallbackName string) (string, bool, error) {
	canvas, err := ParseCanvas(rawCanvas)
	if err != nil {
		return "", false, err
	}

	for _, node := range canvas.Nodes {
		if node.Type != NodeTypeOutput || !node.Data.ExposeAsEndpoint {
			continue
		}

		name := strings.TrimSpace(node.Data.EndpointName)
		if name == "" {
			name = strings.TrimSpace(node.Data.Label)
		}
		if name == "" {
			name = strings.TrimSpace(fallbackName)
		}

		return name, true, nil
	}

	return "", false, nil
}

func (e *PipelineExecutor) Execute(ctx context.Context, userID uint, rawCanvas string) ([]map[string]any, error) {
	return e.ExecuteWithOptions(ctx, userID, rawCanvas, ExecuteOptions{Manual: true})
}

func (e *PipelineExecutor) ExecuteWithOptions(ctx context.Context, userID uint, rawCanvas string, options ExecuteOptions) ([]map[string]any, error) {
	canvas, err := ParseCanvas(rawCanvas)
	if err != nil {
		return nil, err
	}

	nodeByID := make(map[string]Node, len(canvas.Nodes))
	incoming := make(map[string][]Edge, len(canvas.Nodes))
	outgoing := make(map[string][]Edge, len(canvas.Nodes))
	indegree := make(map[string]int, len(canvas.Nodes))

	for _, node := range canvas.Nodes {
		if strings.TrimSpace(node.ID) == "" || strings.TrimSpace(node.Type) == "" {
			return nil, ErrInvalidCanvas
		}

		nodeByID[node.ID] = node
		indegree[node.ID] = 0
	}

	for _, edge := range canvas.Edges {
		if _, ok := nodeByID[edge.Source]; !ok {
			return nil, ErrInvalidCanvas
		}
		if _, ok := nodeByID[edge.Target]; !ok {
			return nil, ErrInvalidCanvas
		}
		incoming[edge.Target] = append(incoming[edge.Target], edge)
		outgoing[edge.Source] = append(outgoing[edge.Source], edge)
		indegree[edge.Target]++
	}

	order, err := topologicalOrder(indegree, outgoing)
	if err != nil {
		return nil, err
	}

	buffers := make(map[string][]map[string]any, len(canvas.Nodes))
	var outputRows []map[string]any
	foundOutput := false

	for _, nodeID := range order {
		node := nodeByID[nodeID]
		rows, err := e.executeNode(ctx, userID, node, incoming[nodeID], buffers, options)
		if err != nil {
			return nil, fmt.Errorf("execute %s node %q: %w", node.Type, nodeID, err)
		}

		buffers[nodeID] = rows
		if node.Type == NodeTypeOutput {
			outputRows = rows
			foundOutput = true
		}
	}

	if !foundOutput {
		return nil, ErrMissingOutputNode
	}

	return outputRows, nil
}

func (e *PipelineExecutor) executeNode(
	ctx context.Context,
	userID uint,
	node Node,
	incomingEdges []Edge,
	buffers map[string][]map[string]any,
	options ExecuteOptions,
) ([]map[string]any, error) {
	switch node.Type {
	case NodeTypeSource:
		if e.ResolveSource == nil {
			return nil, ErrInvalidCanvas
		}

		source, err := e.ResolveSource(ctx, node.Data.SourceID, userID)
		if err != nil {
			return nil, err
		}

		queryBody := strings.TrimSpace(node.Data.QueryBody)
		switch source.Type {
		case model.DataSourceTypePostgres, model.DataSourceTypeMySQL:
			if queryBody == "" {
				return nil, ErrMissingSourceExecution
			}
			return e.RunDB(ctx, *source, queryBody)
		case model.DataSourceTypeREST:
			if e.RunREST == nil {
				return nil, ErrInvalidCanvas
			}
			request, err := restRequestForNode(node.Data)
			if err != nil {
				return nil, err
			}
			return e.RunREST(ctx, *source, request)
		default:
			return nil, fmt.Errorf("unsupported source type %q", source.Type)
		}
	case NodeTypeFilter:
		rows, err := singleInputRows(node, incomingEdges, buffers)
		if err != nil {
			return nil, err
		}
		return applyFilter(rows, node.Data)
	case NodeTypeTransform:
		rows, err := singleInputRows(node, incomingEdges, buffers)
		if err != nil {
			return nil, err
		}
		return applyTransform(rows, node.Data), nil
	case NodeTypeJoin:
		return applyJoin(node, incomingEdges, buffers)
	case NodeTypeOutput:
		return singleInputRows(node, incomingEdges, buffers)
	case NodeTypeTelegramTrigger:
		return e.executeTelegramTrigger(node, options)
	case NodeTypeTelegramTemplate:
		rows, err := singleInputRows(node, incomingEdges, buffers)
		if err != nil {
			return nil, err
		}
		return applyTelegramTemplate(rows, node.Data)
	case NodeTypeTelegramSend:
		rows, err := singleInputRows(node, incomingEdges, buffers)
		if err != nil {
			return nil, err
		}
		return e.executeTelegramSend(ctx, userID, node.Data, rows)
	default:
		return nil, fmt.Errorf("unsupported node type %q", node.Type)
	}
}

func (e *PipelineExecutor) executeTelegramTrigger(node Node, options ExecuteOptions) ([]map[string]any, error) {
	if node.Data.TelegramIntegrationID == 0 {
		return nil, errors.New("telegram trigger requires telegramIntegrationId")
	}

	var rows []map[string]any
	if provided := options.TelegramEvents[node.Data.TelegramIntegrationID]; len(provided) > 0 {
		rows = cloneRows(provided)
	} else {
		mockRows, err := mockTelegramRows(node.Data)
		if err != nil {
			return nil, err
		}
		if len(mockRows) > 0 {
			rows = mockRows
		}
	}

	if len(rows) == 0 {
		if options.Manual {
			rows = []map[string]any{defaultMockTelegramRow(node.Data.TelegramIntegrationID)}
		} else {
			return nil, ErrTelegramTriggerNoMatch
		}
	}

	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if telegramRowMatches(node.Data, row) {
			filtered = append(filtered, cloneRow(row))
		}
	}
	if len(filtered) == 0 {
		return nil, ErrTelegramTriggerNoMatch
	}

	return filtered, nil
}

func (e *PipelineExecutor) executeTelegramSend(
	ctx context.Context,
	userID uint,
	data NodeData,
	rows []map[string]any,
) ([]map[string]any, error) {
	if data.TelegramIntegrationID == 0 {
		return nil, errors.New("telegram send requires telegramIntegrationId")
	}
	if e.ResolveTelegramIntegration == nil || e.SendTelegram == nil {
		return nil, errors.New("telegram sending is not configured")
	}

	integration, err := e.ResolveTelegramIntegration(ctx, data.TelegramIntegrationID, userID)
	if err != nil {
		return nil, err
	}

	messageField := strings.TrimSpace(data.MessageField)
	if messageField == "" {
		messageField = "telegram_message"
	}

	sentRows := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		text := strings.TrimSpace(fmt.Sprint(row[messageField]))
		if text == "" {
			return nil, fmt.Errorf("telegram send requires %s on each input row", messageField)
		}

		chatID := strings.TrimSpace(data.ChatID)
		if chatID == "" {
			if rowChatID, ok := row["telegram_chat_id"]; ok {
				chatID = strings.TrimSpace(fmt.Sprint(rowChatID))
			}
		}
		if chatID == "" {
			chatID = strings.TrimSpace(integration.DefaultChatID)
		}
		if chatID == "" {
			return nil, errors.New("telegram send requires chatId or a default chat on the integration")
		}

		delivery, err := e.SendTelegram(ctx, *integration, TelegramMessage{
			ChatID:    chatID,
			Text:      text,
			ParseMode: strings.TrimSpace(data.ParseMode),
		})
		if err != nil {
			return nil, err
		}

		next := cloneRow(row)
		next["telegram_chat_id"] = chatID
		next["telegram_delivery"] = "sent"
		for key, value := range delivery {
			next[key] = value
		}
		sentRows = append(sentRows, next)
	}

	return sentRows, nil
}

func restRequestForNode(data NodeData) (restrequest.Request, error) {
	if strings.TrimSpace(data.RESTMethod) != "" ||
		strings.TrimSpace(data.RESTPath) != "" ||
		len(data.RESTQueryParams) > 0 ||
		len(data.RESTHeaders) > 0 ||
		strings.TrimSpace(data.RESTBody) != "" {
		return restrequest.FromFields(data.RESTMethod, data.RESTPath, data.RESTQueryParams, data.RESTHeaders, data.RESTBody)
	}

	if strings.TrimSpace(data.QueryBody) == "" {
		return restrequest.Request{}, ErrMissingSourceExecution
	}

	return restrequest.Parse(data.QueryBody)
}

func topologicalOrder(indegree map[string]int, outgoing map[string][]Edge) ([]string, error) {
	queue := make([]string, 0)
	for nodeID, degree := range indegree {
		if degree == 0 {
			queue = append(queue, nodeID)
		}
	}
	sort.Strings(queue)

	order := make([]string, 0, len(indegree))
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		order = append(order, nodeID)

		for _, edge := range outgoing[nodeID] {
			indegree[edge.Target]--
			if indegree[edge.Target] == 0 {
				queue = append(queue, edge.Target)
				sort.Strings(queue)
			}
		}
	}

	if len(order) != len(indegree) {
		return nil, ErrPipelineCycleDetected
	}

	return order, nil
}

func singleInputRows(node Node, incomingEdges []Edge, buffers map[string][]map[string]any) ([]map[string]any, error) {
	if len(incomingEdges) != 1 {
		return nil, fmt.Errorf("%s node requires exactly one input", node.Type)
	}

	return cloneRows(buffers[incomingEdges[0].Source]), nil
}

func applyFilter(rows []map[string]any, data NodeData) ([]map[string]any, error) {
	column := strings.TrimSpace(data.Column)
	operator := strings.TrimSpace(data.Operator)
	if column == "" || operator == "" {
		return nil, errors.New("filter node requires column and operator")
	}

	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		value, ok := row[column]
		if !ok {
			continue
		}
		if compareFilterValue(value, operator, data.Value) {
			filtered = append(filtered, cloneRow(row))
		}
	}

	return filtered, nil
}

func applyTransform(rows []map[string]any, data NodeData) []map[string]any {
	if len(data.Mappings) == 0 {
		return cloneRows(rows)
	}

	mappingByColumn := make(map[string]ColumnMapping, len(data.Mappings))
	for _, mapping := range data.Mappings {
		mappingByColumn[mapping.Original] = mapping
	}

	transformed := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		next := make(map[string]any, len(row))
		for key, value := range row {
			mapping, ok := mappingByColumn[key]
			if !ok {
				next[key] = value
				continue
			}
			if mapping.Drop {
				continue
			}
			target := strings.TrimSpace(mapping.New)
			if target == "" {
				target = key
			}
			next[target] = value
		}
		transformed = append(transformed, next)
	}

	return transformed
}

func applyJoin(node Node, incomingEdges []Edge, buffers map[string][]map[string]any) ([]map[string]any, error) {
	if len(incomingEdges) != 2 {
		return nil, errors.New("join node requires exactly two inputs")
	}

	joinKey := strings.TrimSpace(node.Data.JoinKey)
	if joinKey == "" {
		return nil, errors.New("join node requires joinKey")
	}

	leftRows := buffers[incomingEdges[0].Source]
	rightRows := buffers[incomingEdges[1].Source]
	rightIndex := make(map[string][]map[string]any, len(rightRows))
	for _, row := range rightRows {
		if key, ok := row[joinKey]; ok {
			rightIndex[normalizeKey(key)] = append(rightIndex[normalizeKey(key)], row)
		}
	}

	result := make([]map[string]any, 0)
	joinType := strings.ToLower(strings.TrimSpace(node.Data.JoinType))
	if joinType == "" {
		joinType = "inner"
	}

	for _, left := range leftRows {
		key, ok := left[joinKey]
		if !ok {
			if joinType == "left" {
				result = append(result, cloneRow(left))
			}
			continue
		}

		matches := rightIndex[normalizeKey(key)]
		if len(matches) == 0 {
			if joinType == "left" {
				result = append(result, cloneRow(left))
			}
			continue
		}

		for _, right := range matches {
			joined := cloneRow(left)
			for column, value := range right {
				if _, exists := joined[column]; exists && column != joinKey {
					joined["right_"+column] = value
					continue
				}
				joined[column] = value
			}
			result = append(result, joined)
		}
	}

	return result, nil
}

func compareFilterValue(value any, operator string, expected string) bool {
	switch operator {
	case "=":
		return normalizeKey(value) == expected
	case "!=":
		return normalizeKey(value) != expected
	case "contains":
		return strings.Contains(strings.ToLower(fmt.Sprint(value)), strings.ToLower(expected))
	case ">", "<":
		left, leftOK := numericValue(value)
		right, rightOK := numericValue(expected)
		if !leftOK || !rightOK {
			return false
		}
		if operator == ">" {
			return left > right
		}
		return left < right
	default:
		return false
	}
}

func numericValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case json.Number:
		v, err := typed.Float64()
		return v, err == nil
	case string:
		v, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return v, err == nil
	default:
		v, err := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(value)), 64)
		return v, err == nil
	}
}

func normalizeKey(value any) string {
	return strings.TrimSpace(fmt.Sprint(value))
}

func cloneRows(rows []map[string]any) []map[string]any {
	cloned := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		cloned = append(cloned, cloneRow(row))
	}
	return cloned
}

func cloneRow(row map[string]any) map[string]any {
	cloned := make(map[string]any, len(row))
	for key, value := range row {
		cloned[key] = value
	}
	return cloned
}

func mockTelegramRows(data NodeData) ([]map[string]any, error) {
	raw := strings.TrimSpace(data.MockEventJSON)
	if raw == "" {
		return nil, nil
	}

	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, fmt.Errorf("mock telegram event must be valid JSON: %w", err)
	}

	switch typed := payload.(type) {
	case []any:
		rows := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			row, ok := item.(map[string]any)
			if !ok {
				return nil, errors.New("mock telegram event array must contain JSON objects")
			}
			rows = append(rows, normalizeTelegramRow(data.TelegramIntegrationID, row))
		}
		return rows, nil
	case map[string]any:
		return []map[string]any{normalizeTelegramRow(data.TelegramIntegrationID, typed)}, nil
	default:
		return nil, errors.New("mock telegram event must be a JSON object or array of objects")
	}
}

func defaultMockTelegramRow(integrationID uint) map[string]any {
	return map[string]any{
		"telegram_integration_id": integrationID,
		"telegram_update_id":      "manual-preview",
		"telegram_message_text":   "/start",
		"telegram_command":        "/start",
		"telegram_from_id":        "42",
		"telegram_from_username":  "demo-user",
	}
}

func normalizeTelegramRow(integrationID uint, row map[string]any) map[string]any {
	next := cloneRow(row)
	if _, ok := next["telegram_integration_id"]; !ok {
		next["telegram_integration_id"] = integrationID
	}
	text := strings.TrimSpace(fmt.Sprint(next["telegram_message_text"]))
	if text == "" {
		text = strings.TrimSpace(fmt.Sprint(next["message_text"]))
		if text != "" {
			next["telegram_message_text"] = text
		}
	}
	if _, ok := next["telegram_chat_id"]; !ok {
		if rawChatID, ok := next["chat_id"]; ok {
			if chatID := strings.TrimSpace(fmt.Sprint(rawChatID)); chatID != "" && chatID != "<nil>" {
				next["telegram_chat_id"] = chatID
			}
		}
	}
	if _, ok := next["telegram_command"]; !ok && strings.HasPrefix(text, "/") {
		command := text
		if idx := strings.IndexAny(command, " \n\t"); idx >= 0 {
			command = command[:idx]
		}
		next["telegram_command"] = command
	}

	return next
}

func telegramRowMatches(data NodeData, row map[string]any) bool {
	commandFilter := strings.TrimSpace(data.TriggerCommand)
	if commandFilter != "" {
		command := strings.TrimSpace(fmt.Sprint(row["telegram_command"]))
		if command == "" || !strings.EqualFold(command, commandFilter) {
			return false
		}
	}

	textFilter := strings.TrimSpace(data.TriggerTextContains)
	if textFilter != "" {
		text := strings.ToLower(strings.TrimSpace(fmt.Sprint(row["telegram_message_text"])))
		if !strings.Contains(text, strings.ToLower(textFilter)) {
			return false
		}
	}

	return true
}

func applyTelegramTemplate(rows []map[string]any, data NodeData) ([]map[string]any, error) {
	template := strings.TrimSpace(data.Template)
	if template == "" {
		return nil, errors.New("telegram template requires template text")
	}

	messageField := strings.TrimSpace(data.MessageField)
	if messageField == "" {
		messageField = "telegram_message"
	}

	result := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		next := cloneRow(row)
		next[messageField] = renderTelegramTemplate(template, row)
		result = append(result, next)
	}

	return result, nil
}

func renderTelegramTemplate(template string, row map[string]any) string {
	return telegramPlaceholderRE.ReplaceAllStringFunc(template, func(match string) string {
		parts := telegramPlaceholderRE.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		value, ok := lookupTemplateValue(row, parts[1])
		if !ok {
			return ""
		}
		return strings.TrimSpace(fmt.Sprint(value))
	})
}

func lookupTemplateValue(row map[string]any, key string) (any, bool) {
	current := any(row)
	for _, part := range strings.Split(key, ".") {
		nextMap, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		value, exists := nextMap[part]
		if !exists {
			return nil, false
		}
		current = value
	}

	return current, true
}
