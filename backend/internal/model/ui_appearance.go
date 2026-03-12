package model

import (
	"regexp"
	"strconv"
)

const (
	UIModeLight = "light"
	UIModeDark  = "dark"
)

const (
	UIPaletteNeutral = "neutral"
	UIPaletteStone   = "stone"
	UIPaletteSlate   = "slate"
	UIPaletteBlue    = "blue"
	UIPaletteEmerald = "emerald"
	UIPaletteAmber   = "amber"
	UIPaletteRose    = "rose"
	UIPaletteViolet  = "violet"
)

const (
	UIDensityCompact     = "compact"
	UIDensityComfortable = "comfortable"
	UIDensitySpacious    = "spacious"
)

const (
	UIRadius10 = 10
	UIRadius14 = 14
	UIRadius18 = 18
	UIRadius24 = 24
)

var hexColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type UIAppearanceDefaults struct {
	Mode         string  `json:"mode"`
	Palette      string  `json:"palette"`
	Radius       int     `json:"radius"`
	Density      string  `json:"density"`
	CustomAccent *string `json:"customAccent,omitempty"`
}

type UIAppearanceOverride struct {
	Mode         *string `json:"mode,omitempty"`
	Palette      *string `json:"palette,omitempty"`
	Radius       *int    `json:"radius,omitempty"`
	Density      *string `json:"density,omitempty"`
	CustomAccent *string `json:"customAccent,omitempty"`
}

type ResolvedUIAppearance struct {
	Mode         string  `json:"mode"`
	Palette      string  `json:"palette"`
	Radius       int     `json:"radius"`
	Density      string  `json:"density"`
	CustomAccent *string `json:"customAccent,omitempty"`
}

func DefaultUIMode() string {
	return UIModeLight
}

func DefaultUIPalette() string {
	return UIPaletteBlue
}

func DefaultUIRadius() int {
	return UIRadius14
}

func DefaultUIDensity() string {
	return UIDensityComfortable
}

func IsValidUIMode(value string) bool {
	switch value {
	case UIModeLight, UIModeDark:
		return true
	default:
		return false
	}
}

func IsValidUIPalette(value string) bool {
	switch value {
	case UIPaletteNeutral, UIPaletteStone, UIPaletteSlate, UIPaletteBlue, UIPaletteEmerald, UIPaletteAmber, UIPaletteRose, UIPaletteViolet:
		return true
	default:
		return false
	}
}

func IsValidUIDensity(value string) bool {
	switch value {
	case UIDensityCompact, UIDensityComfortable, UIDensitySpacious:
		return true
	default:
		return false
	}
}

func IsValidUIRadius(value int) bool {
	switch value {
	case UIRadius10, UIRadius14, UIRadius18, UIRadius24:
		return true
	default:
		return false
	}
}

func IsValidUICustomAccent(value string) bool {
	return hexColorPattern.MatchString(value)
}

func UIRadiusValues() []int {
	return []int{UIRadius10, UIRadius14, UIRadius18, UIRadius24}
}

func UIRadiusValuesString() string {
	values := UIRadiusValues()
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, strconv.Itoa(value))
	}
	if len(parts) == 0 {
		return ""
	}
	return parts[0] + ", " + parts[1] + ", " + parts[2] + ", " + parts[3]
}
