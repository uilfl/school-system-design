# Kubernetes 部署配置

## 部署步驟

### 1. 建立 Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. 建立 ConfigMap 和 Secrets

```bash
# ConfigMap
kubectl apply -f configmap.yaml

# Secrets (請先編輯 secret.yaml，填入 base64 編碼的密鑰)
# 或使用以下命令直接創建：
kubectl create secret generic api-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@host:5432/db' \
  --from-literal=JWT_SECRET='your-jwt-secret' \
  --from-literal=REFRESH_TOKEN_SECRET='your-refresh-secret' \
  --from-literal=ENCRYPTION_KEY='your-encryption-key' \
  --namespace=school-saas
```

### 3. 部署應用

```bash
kubectl apply -f deployment.yaml
```

### 4. 設定 Ingress

```bash
kubectl apply -f ingress.yaml
```

### 5. 設定自動擴展

```bash
kubectl apply -f hpa.yaml
```

## 檢查部署狀態

```bash
# 檢查 pods
kubectl get pods -n school-saas

# 檢查 services
kubectl get svc -n school-saas

# 檢查 ingress
kubectl get ingress -n school-saas

# 查看 HPA 狀態
kubectl get hpa -n school-saas

# 查看日誌
kubectl logs -f deployment/api -n school-saas
```

## 擴展和更新

```bash
# 手動擴展
kubectl scale deployment api --replicas=5 -n school-saas

# 更新 image
kubectl set image deployment/api api=school-saas/api:v1.1.0 -n school-saas

# 查看更新狀態
kubectl rollout status deployment/api -n school-saas

# 回滾
kubectl rollout undo deployment/api -n school-saas
```

## 生產環境建議

1. **使用 Helm Charts** 管理部署
2. **使用 Sealed Secrets** 或 **External Secrets Operator** 管理敏感資訊
3. **配置 Pod Disruption Budgets** 確保高可用性
4. **設定 Network Policies** 控制網路流量
5. **使用 Prometheus & Grafana** 監控
6. **配置 log aggregation** (ELK/Loki)
