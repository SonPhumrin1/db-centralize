package uuidv7

import (
	"crypto/rand"
	"time"

	"github.com/google/uuid"
)

// New generates a UUIDv7 using the current UTC timestamp in milliseconds.
func New() (uuid.UUID, error) {
	var u uuid.UUID
	if _, err := rand.Read(u[:]); err != nil {
		return uuid.Nil, err
	}

	ts := uint64(time.Now().UTC().UnixMilli())
	u[0] = byte(ts >> 40)
	u[1] = byte(ts >> 32)
	u[2] = byte(ts >> 24)
	u[3] = byte(ts >> 16)
	u[4] = byte(ts >> 8)
	u[5] = byte(ts)

	u[6] = (u[6] & 0x0f) | 0x70 // version 7
	u[8] = (u[8] & 0x3f) | 0x80 // variant RFC4122

	return u, nil
}

// NewString returns a UUIDv7 encoded as a hyphenated string.
func NewString() (string, error) {
	u, err := New()
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
