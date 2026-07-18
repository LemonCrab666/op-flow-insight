package conntrack

import (
	"context"
	"errors"
)

var ErrEventUnsupported = errors.New("conntrack destroy events are unsupported on this platform")

type DestroyHandler func(Connection)

// ListenDestroy subscribes to final conntrack counters. Polling provides live
// rates; destroy events account for short-lived flows and bytes transferred
// between the final poll and connection teardown.
func ListenDestroy(ctx context.Context, handler DestroyHandler) error {
	return listenDestroy(ctx, handler)
}
