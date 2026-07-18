//go:build !linux

package conntrack

import "context"

func listenDestroy(_ context.Context, _ DestroyHandler) error {
	return ErrEventUnsupported
}
