# PulseWatch local Kubernetes cluster (kind)

Reproducible bring-up of the Phase 4 environment: a 3-node kind cluster with
Envoy Gateway (Gateway API), Sealed Secrets, and ArgoCD deploying the app from
Git. cloud-provider-kind provides a real LoadBalancer address so the Gateway is
reachable on `localhost:80`.

Images are the private repo `yh61/pulsewatch-images-docker-repo`, version **1.0.8**.

## Prerequisites

- Docker Desktop (WSL2), `kubectl`, `kind`, `helm`
- `docker login` to the private image repo (needed for the pulls in step 6)
- `kubeseal` (only needed to re-seal secrets on a brand-new cluster, see step 8)

## Bring it up (fresh cluster)

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

# 5. Sealed Secrets controller (decrypts the SealedSecrets shipped in the chart)
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/latest/download/controller.yaml
kubectl rollout status deployment/sealed-secrets-controller -n kube-system --timeout=120s

# 6. Load the private images into the cluster (side-loads; no in-cluster registry creds needed)
for t in api-1.0.8 worker-1.0.8 postgres-1.0.8; do
  docker pull yh61/pulsewatch-images-docker-repo:$t
  kind load docker-image yh61/pulsewatch-images-docker-repo:$t --name pulsewatch
done

# 7. Namespace
kubectl apply -f k8s/namespace.yaml

# 8. Secrets. The chart ships SealedSecrets, but they are encrypted for a SPECIFIC
#    cluster's key. On a BRAND-NEW cluster the key differs, so re-seal from the
#    plaintext template (gitignored) and push, so ArgoCD deploys secrets that this
#    cluster can decrypt. On the SAME cluster (stop/start) skip this - the committed
#    SealedSecrets already work.
#      cp k8s/secrets.example.yaml k8s/secrets.yaml   # first time only: fill in real values
kubeseal --controller-name sealed-secrets-controller --controller-namespace kube-system \
  --format yaml < k8s/secrets.yaml > helm/pulsewatch/templates/sealed-secrets.yaml
git add helm/pulsewatch/templates/sealed-secrets.yaml && git commit -m "chore: re-seal secrets" && git push

# 9. Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl rollout status deployment/argocd-server -n argocd --timeout=180s

# 10. Deploy via GitOps. ArgoCD renders helm/pulsewatch from develop and deploys
#     everything: postgres, api (+ HPA/PDB), worker, gateway + HTTPRoutes, rate
#     limits, and the SealedSecrets (controller decrypts them into the app's Secrets).
kubectl apply -f gitops/Pulsewatch-application.yaml

# 11. cloud-provider-kind: LoadBalancer address + publishes the Gateway to localhost:80.
#     --restart=unless-stopped => auto-starts with Docker.
docker build -t pulsewatch/cloud-provider-kind:v0.11.1 \
  -f cluster/Dockerfile.cloud-provider-kind cluster/
docker run -d --name cloud-provider-kind --restart=unless-stopped \
  --network kind -v /var/run/docker.sock:/var/run/docker.sock \
  pulsewatch/cloud-provider-kind:v0.11.1
```

> Quick manual alternative (no GitOps): skip steps 9-10 and run
> `helm upgrade --install pulsewatch helm/pulsewatch -n pulsewatch`. The
> SealedSecrets still need the controller (step 5) and a valid seal (step 8).

## Verify

```bash
curl http://localhost/health   # {"status":"ok"}
curl http://localhost/ready    # {"status":"ready"}  (checks DB)
kubectl get application pulsewatch -n argocd            # SYNCED / HEALTHY
kubectl get gateway pulsewatch-gateway -n pulsewatch    # PROGRAMMED=True
```

ArgoCD UI: `kubectl port-forward svc/argocd-server -n argocd 8080:443`, then
https://localhost:8080 (user `admin`, password from
`kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`).

## Pause / resume

The cluster does not need rebuilding between sessions. To turn it off and back on
(data, images, secrets and the ArgoCD-managed app all persist):

```bash
./cluster/stop.sh     # stop the kind nodes + cloud-provider-kind
./cluster/start.sh    # start, wait for readiness, refresh the LB, verify localhost
```

Nodes use restart=on-failure, so they do not auto-start after a machine reboot;
run start.sh to bring everything back.

## Sealed Secrets

Secrets live in Git as `helm/pulsewatch/templates/sealed-secrets.yaml`, encrypted.
The in-cluster sealed-secrets controller decrypts them into the two Secrets the app
references (`pulsewatch-db-credentials`, `pulsewatch-app-secrets`). The ciphertext is
safe to commit publicly; only the controller's private key can decrypt it.

Caveat: a SealedSecret is bound to the controller's key, which is generated per
cluster. So the committed SealedSecrets only decrypt on the cluster they were sealed
against. On a rebuilt cluster, either re-seal from `k8s/secrets.yaml` (step 8) or
restore a backup of the controller's key. `k8s/secrets.yaml` (gitignored plaintext)
is kept solely for re-sealing.

## Notes

- cloud-provider-kind must run on the host (it needs the Docker socket + CLI to
  create the LB container); it cannot be an in-cluster DaemonSet. The
  `--restart=unless-stopped` container auto-starts whenever Docker starts.
- On Docker Desktop/WSL2 the LB's EXTERNAL-IP (a docker-bridge IP like 172.18.x.x)
  is not routable from the host; use `localhost` (cloud-provider-kind publishes
  the service to `0.0.0.0:80`).
- The official `registry.k8s.io/cloud-provider-kind` image did not resolve for
  these versions, hence the local wrapper image.
