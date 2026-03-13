package executor

import (
	"context"
	"encoding/json"
	"testing"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/restrequest"
)

func TestPipelineExecutorFilterNode(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "source-a", Type: NodeTypeSource, Data: NodeData{SourceID: 1, QueryBody: "select"}},
			{ID: "filter-a", Type: NodeTypeFilter, Data: NodeData{Column: "status", Operator: "=", Value: "open"}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{
			{ID: "e1", Source: "source-a", Target: "filter-a"},
			{ID: "e2", Source: "filter-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 1 || rows[0]["status"] != "open" {
		t.Fatalf("unexpected rows: %#v", rows)
	}
}

func TestPipelineExecutorTransformNode(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "source-a", Type: NodeTypeSource, Data: NodeData{SourceID: 1, QueryBody: "select"}},
			{ID: "transform-a", Type: NodeTypeTransform, Data: NodeData{
				Mappings: []ColumnMapping{
					{Original: "amount", New: "total"},
					{Original: "status", Drop: true},
				},
			}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{
			{ID: "e1", Source: "source-a", Target: "transform-a"},
			{ID: "e2", Source: "transform-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if _, exists := rows[0]["amount"]; exists {
		t.Fatalf("expected amount column to be renamed: %#v", rows[0])
	}
	if _, exists := rows[0]["status"]; exists {
		t.Fatalf("expected status column to be dropped: %#v", rows[0])
	}
	if rows[0]["total"] != 42 {
		t.Fatalf("expected total column, got %#v", rows[0])
	}
}

func TestPipelineExecutorJoinNode(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "source-a", Type: NodeTypeSource, Data: NodeData{SourceID: 1, QueryBody: "select left"}},
			{ID: "source-b", Type: NodeTypeSource, Data: NodeData{SourceID: 2, QueryBody: "select right"}},
			{ID: "join-a", Type: NodeTypeJoin, Data: NodeData{JoinKey: "id", JoinType: "left"}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{
			{ID: "e1", Source: "source-a", Target: "join-a"},
			{ID: "e2", Source: "source-b", Target: "join-a"},
			{ID: "e3", Source: "join-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 2 {
		t.Fatalf("expected 2 joined rows, got %#v", rows)
	}
	if rows[0]["name"] != "Alice" || rows[0]["city"] != "Paris" {
		t.Fatalf("unexpected joined row: %#v", rows[0])
	}
}

func TestPipelineExecutorRestSourceAndOutput(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "source-a", Type: NodeTypeSource, Data: NodeData{SourceID: 3, QueryBody: "/orders"}},
			{ID: "output-a", Type: NodeTypeOutput, Data: NodeData{ExposeAsEndpoint: true, EndpointName: "Orders API"}},
		},
		Edges: []Edge{
			{ID: "e1", Source: "source-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 1 || rows[0]["path"] != "/orders" {
		t.Fatalf("unexpected rest rows: %#v", rows)
	}
}

func TestPipelineExecutorStructuredRESTSource(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "source-a", Type: NodeTypeSource, Data: NodeData{
				SourceID:        3,
				RESTMethod:      "POST",
				RESTPath:        "/alerts",
				RESTQueryParams: map[string]string{"severity": "high"},
				RESTHeaders:     map[string]string{"X-Test": "ok"},
				RESTBody:        `{"orderCode":"ORD-1001"}`,
			}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{{ID: "e1", Source: "source-a", Target: "output-a"}},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 1 || rows[0]["method"] != "POST" || rows[0]["queryParams"].(map[string]string)["severity"] != "high" {
		t.Fatalf("unexpected structured rest rows: %#v", rows)
	}
}

func TestPipelineExecutorTelegramFlow(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "trigger-a", Type: NodeTypeTelegramTrigger, Data: NodeData{
				TelegramIntegrationID: 9,
				TriggerCommand:        "/orders",
				MockEventJSON:         `{"telegram_chat_id":"123","telegram_message_text":"/orders","telegram_command":"/orders","order_code":"ORD-1001"}`,
			}},
			{ID: "template-a", Type: NodeTypeTelegramTemplate, Data: NodeData{
				Template:     "Order {{order_code}} received from {{telegram_from_username}}",
				MessageField: "telegram_message",
			}},
			{ID: "send-a", Type: NodeTypeTelegramSend, Data: NodeData{
				TelegramIntegrationID: 9,
				MessageField:          "telegram_message",
			}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{
			{ID: "e1", Source: "trigger-a", Target: "template-a"},
			{ID: "e2", Source: "template-a", Target: "send-a"},
			{ID: "e3", Source: "send-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 1 || rows[0]["telegram_delivery"] != "sent" || rows[0]["telegram_message_id"] != int64(99) {
		t.Fatalf("unexpected telegram rows: %#v", rows)
	}
}

func TestPipelineExecutorTelegramFlowUsesIntegrationDefaultChatOnManualRun(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "trigger-a", Type: NodeTypeTelegramTrigger, Data: NodeData{
				TelegramIntegrationID: 9,
				TriggerCommand:        "/start",
			}},
			{ID: "template-a", Type: NodeTypeTelegramTemplate, Data: NodeData{
				Template:     "Manual test for {{telegram_from_username}}",
				MessageField: "telegram_message",
			}},
			{ID: "send-a", Type: NodeTypeTelegramSend, Data: NodeData{
				TelegramIntegrationID: 9,
				MessageField:          "telegram_message",
			}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{
			{ID: "e1", Source: "trigger-a", Target: "template-a"},
			{ID: "e2", Source: "template-a", Target: "send-a"},
			{ID: "e3", Source: "send-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 1 || rows[0]["telegram_chat_id"] != "123" || rows[0]["telegram_delivery"] != "sent" {
		t.Fatalf("unexpected telegram rows: %#v", rows)
	}
}

func TestPipelineExecutorTelegramFlowUsesIntegrationDefaultChatWithCustomMock(t *testing.T) {
	t.Parallel()

	rows, err := testExecutor(t).Execute(context.Background(), 7, mustCanvasJSON(t, Canvas{
		Nodes: []Node{
			{ID: "trigger-a", Type: NodeTypeTelegramTrigger, Data: NodeData{
				TelegramIntegrationID: 9,
				MockEventJSON:         `{"telegram_message_text":"/orders","telegram_command":"/orders","telegram_from_username":"operator"}`,
			}},
			{ID: "template-a", Type: NodeTypeTelegramTemplate, Data: NodeData{
				Template:     "Manual test from {{telegram_from_username}}",
				MessageField: "telegram_message",
			}},
			{ID: "send-a", Type: NodeTypeTelegramSend, Data: NodeData{
				TelegramIntegrationID: 9,
				MessageField:          "telegram_message",
			}},
			{ID: "output-a", Type: NodeTypeOutput},
		},
		Edges: []Edge{
			{ID: "e1", Source: "trigger-a", Target: "template-a"},
			{ID: "e2", Source: "template-a", Target: "send-a"},
			{ID: "e3", Source: "send-a", Target: "output-a"},
		},
	}))
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if len(rows) != 1 || rows[0]["telegram_chat_id"] != "123" || rows[0]["telegram_delivery"] != "sent" {
		t.Fatalf("unexpected telegram rows: %#v", rows)
	}
}

func testExecutor(t *testing.T) *PipelineExecutor {
	t.Helper()

	return &PipelineExecutor{
		ResolveSource: func(_ context.Context, id, userID uint) (*model.DataSource, error) {
			if userID != 7 {
				t.Fatalf("unexpected user id %d", userID)
			}

			switch id {
			case 1, 2:
				return &model.DataSource{ID: id, UserID: userID, Type: model.DataSourceTypePostgres}, nil
			case 3:
				return &model.DataSource{ID: id, UserID: userID, Type: model.DataSourceTypeREST}, nil
			default:
				t.Fatalf("unexpected source id %d", id)
				return nil, nil
			}
		},
		RunDB: func(_ context.Context, source model.DataSource, queryBody string, _ QueryExecutionOptions) ([]map[string]any, error) {
			switch source.ID {
			case 1:
				return []map[string]any{
					{"id": 1, "status": "open", "amount": 42, "name": "Alice"},
					{"id": 2, "status": "closed", "amount": 21, "name": "Bob"},
				}, nil
			case 2:
				return []map[string]any{
					{"id": 1, "city": "Paris"},
				}, nil
			default:
				t.Fatalf("unexpected db source %#v with query %q", source, queryBody)
				return nil, nil
			}
		},
		RunREST: func(_ context.Context, source model.DataSource, request restrequest.Request, _ QueryExecutionOptions) ([]map[string]any, error) {
			if source.ID != 3 {
				t.Fatalf("unexpected rest source %#v", source)
			}
			return []map[string]any{{
				"path":        request.Path,
				"kind":        "rest",
				"method":      request.Method,
				"queryParams": request.QueryParams,
			}}, nil
		},
		ResolveTelegramIntegration: func(_ context.Context, id, userID uint) (*model.TelegramIntegration, error) {
			if userID != 7 || id != 9 {
				t.Fatalf("unexpected telegram integration id=%d user=%d", id, userID)
			}
			return &model.TelegramIntegration{ID: id, UserID: userID, DefaultChatID: "123", IsActive: true}, nil
		},
		SendTelegram: func(_ context.Context, integration model.TelegramIntegration, message TelegramMessage) (map[string]any, error) {
			if integration.ID != 9 {
				t.Fatalf("unexpected integration %#v", integration)
			}
			if message.ChatID != "123" {
				t.Fatalf("unexpected chat id %q", message.ChatID)
			}
			return map[string]any{
				"telegram_message_id": int64(99),
				"telegram_send_ok":    true,
			}, nil
		},
	}
}

func mustCanvasJSON(t *testing.T, canvas Canvas) string {
	t.Helper()

	raw, err := json.Marshal(canvas)
	if err != nil {
		t.Fatalf("json.Marshal(canvas): %v", err)
	}

	return string(raw)
}
