#!/usr/bin/env bash
# Pause the local PulseWatch kind cluster. Nothing is destroyed: PVC data,
# loaded images and the Helm release all persist. Bring it back with start.sh.
set -euo pipefail

CLUSTER=pulsewatch

echo "Stopping kind cluster '$CLUSTER' + cloud-provider-kind..."

NODES=$(kind get nodes --name "$CLUSTER")
docker stop $NODES

# cloud-provider-kind is optional (localhost access); ignore if absent
docker stop cloud-provider-kind >/dev/null 2>&1 || true

echo "Stopped. Data, images and the Helm release are preserved."
echo "Start again with: cluster/start.sh"
