#!/usr/bin/env bash
# Bring the local PulseWatch kind cluster back up (after stop.sh or a reboot)
# and verify it is serving on localhost. Nodes use restart=on-failure, so they
# do not auto-start on reboot; this script starts them manually.
set -euo pipefail

CLUSTER=pulsewatch
NAMESPACE=pulsewatch

echo "Starting kind cluster '$CLUSTER'..."
NODES=$(kind get nodes --name "$CLUSTER")
docker start $NODES

kubectl config use-context "kind-$CLUSTER" >/dev/null 2>&1 || true

# The API server needs a moment after start; querying too early returns
# connection-refused or a transient Forbidden while RBAC bootstraps.
echo "Waiting for the API server to accept requests..."
for i in $(seq 1 40); do
  if kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 3
done

echo "Waiting for nodes to be Ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s

echo "Waiting for app workloads..."
kubectl rollout status statefulset/postgres -n "$NAMESPACE" --timeout=120s || true
kubectl rollout status deployment/api -n "$NAMESPACE" --timeout=120s || true

# After a node restart the LoadBalancer is stale: cloud-provider-kind must
# reprovision it. A plain 'start' is not enough, so restart it to refresh
# localhost:80.
echo "Refreshing cloud-provider-kind (LoadBalancer)..."
docker restart cloud-provider-kind >/dev/null 2>&1 \
  || echo "(cloud-provider-kind container not found; see cluster/README.md step 9)"

echo "Checking http://localhost/health (LB reprovision can take up to ~2 min)..."
for i in $(seq 1 45); do
  if curl -sf --max-time 3 http://localhost/health >/dev/null 2>&1; then
    echo "OK: http://localhost/health is up. Cluster is ready."
    exit 0
  fi
  sleep 3
done

echo "localhost still not responding. The cluster is up; only the LoadBalancer is lagging."
echo "Give it another minute, or run: docker restart cloud-provider-kind"
exit 1
