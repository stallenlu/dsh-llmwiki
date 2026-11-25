#!/usr/bin/env bash
# Full E2E of the fusion actions through the live installed HTTP route.
BASE="http://127.0.0.1:27870/api/llm-wiki/"
call() {
  local action="$1" payload="$2"
  local body
  body=$(curl -s -X POST "$BASE" -H 'Content-Type: application/json' -d "$payload")
  printf '%-20s %s\n' "$action" "$body"
}
echo "=== create vault ==="
call createVault '{"action":"createVault","name":"Fusion E2E","purpose":"verify fusion actions"}'
echo "=== ingest ==="
call ingest '{"action":"ingest","vault":"Fusion-E2E","title":"Transformer notes","text":"Transformers use self-attention. Self-attention relates every token to every other token. Multi-head attention runs several attention functions in parallel. Positional encoding keeps token order."}'
echo "=== pages (H2 meta) ==="
call pages '{"action":"pages","vault":"Fusion-E2E"}'
echo "=== rate ==="
call rate '{"action":"rate","vault":"Fusion-E2E","path":"sources/Transformer-notes.md","quality":5}'
echo "=== staleReview ==="
call staleReview '{"action":"staleReview","vault":"Fusion-E2E"}'
echo "=== fusedQuery ==="
call fusedQuery '{"action":"fusedQuery","vault":"Fusion-E2E","question":"How does self-attention relate tokens?"}'
echo "=== profileDigest ==="
call profileDigest '{"action":"profileDigest","vault":"Fusion-E2E"}'
echo "=== maintenancePlan ==="
call maintenancePlan '{"action":"maintenancePlan","vault":"Fusion-E2E"}'
echo "=== hygiene ==="
call hygiene '{"action":"hygiene","vault":"Fusion-E2E"}'
echo "=== graph ==="
call graph '{"action":"graph","vault":"Fusion-E2E"}'
echo "=== cleanup ==="
call deleteVault '{"action":"deleteVault","id":"Fusion-E2E"}'
