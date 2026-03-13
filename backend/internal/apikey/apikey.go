package apikey

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const secretPrefix = "dpk"

func Generate() (secret string, prefix string, err error) {
	publicBytes := make([]byte, 4)
	privateBytes := make([]byte, 18)
	if _, err = rand.Read(publicBytes); err != nil {
		return "", "", fmt.Errorf("generate api key prefix: %w", err)
	}
	if _, err = rand.Read(privateBytes); err != nil {
		return "", "", fmt.Errorf("generate api key secret: %w", err)
	}

	prefix = hex.EncodeToString(publicBytes)
	secret = fmt.Sprintf("%s_%s_%s", secretPrefix, prefix, hex.EncodeToString(privateBytes))
	return secret, prefix, nil
}

func ParsePrefix(secret string) string {
	parts := strings.Split(strings.TrimSpace(secret), "_")
	if len(parts) != 3 || parts[0] != secretPrefix {
		return ""
	}
	return parts[1]
}

func HashSecret(secret string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash api key: %w", err)
	}
	return string(hash), nil
}

func CompareHash(hash string, secret string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(secret))
}
