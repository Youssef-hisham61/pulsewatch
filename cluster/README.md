# PulseWatch local Kubernetes cluster (kind)

Reproducible bring-up of the Phase 4 environment: a 3-node kind cluster with
Envoy Gateway (Gateway API) and cloud-provider-kind providing a real
LoadBalancer address so the Gateway is reachable on `localhost:80`.

Images are the private repo `yh61/pulsewatch-images-docker-repo`, version **1.0.8**.

## Prerequisites

- Docker Desktop (WSL2), `kubectl`, `kind`, `helm`
- `docker login` to the private image repo (needed for the pulls in step 5)

## Bring it up

```bash
# 1. Create the cluster (no extraPortMappings; port 80 is left free for the LB)
kind create cluster --config cluster/kind-config.yaml

# 2. Install Envoy Gateway
helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.8.3 \
  -n envoy-gateway-system --create-namespace
kubectl rollout status deployment/envoy-gateway -n envoy-gateway-system --timeout=120s

# 3. GatewayClass
kubectl apply -f k8s/gatewayclass.yaml
kubectl wait --for=condition=Accepted gatewayclass/eg --timeout=60s

# 4. metrics-server (required by the api HPA), patched for kind's self-signed kubelet certs
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

# 5. Load the private images into the cluster (side-loads; no in-cluster registry creds needed)
for t in api-1.0.8 worker-1.0.8 postgres-1.0.8; do
  docker pull yh61/pulsewatch-images-docker-repo:$t
  kind load docker-image yh61/pulsewatch-images-docker-repo:$t --name pulsewatch
done

# 6. Secrets (gitignored). Create from the template if you do not have k8s/secrets.yaml:
#    cp k8s/secrets.example.yaml k8s/secrets.yaml   # then fill in real values

# 7. Apply app manifests in order (secrets.yaml explicitly, NOT the whole dir,
#    so secrets.example.yaml placeholders never clobber the real secret)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres.yaml
kubectl rollout status statefulset/postgres -n pulsewatch --timeout=120s
kubectl apply -f k8s/api.yaml -f k8s/worker.yaml -f k8s/gateway.yaml \
              -f k8s/api-hpa.yaml -f k8s/api-pdb.yaml

# 8. cloud-provider-kind: gives LoadBalancer services a real address and publishes
#    the Gateway to localhost:80. --restart=unless-stopped => auto-starts with Docker.
docker build -t pulsewatch/cloud-provider-kind:v0.11.1 \
  -f cluster/Dockerfile.cloud-provider-kind cluster/
docker run -d --name cloud-provider-kind --restart=unless-stopped \
  --network kind -v /var/run/docker.sock:/var/run/docker.sock \
  pulsewatch/cloud-provider-kind:v0.11.1
```

## Verify

```bash
curl http://localhost/health   # {"status":"ok"}
curl http://localhost/ready    # {"status":"ready"}  (checks DB)
kubectl get gateway pulsewatch-gateway -n pulsewatch   # PROGRAMMED=True
```

## Notes

- cloud-provider-kind must run on the host (it needs the Docker socket + CLI to
  create the LB container); it cannot be an in-cluster DaemonSet. The
  `--restart=unless-stopped` container auto-starts whenever Docker starts.
- On Docker Desktop/WSL2 the LB's EXTERNAL-IP (a docker-bridge IP like 172.18.x.x)
  is not routable from the host; use `localhost` (cloud-provider-kind publishes
  the service to `0.0.0.0:80`).
- The official `registry.k8s.io/cloud-provider-kind` image did not resolve for
  these versions, hence the local wrapper image.
