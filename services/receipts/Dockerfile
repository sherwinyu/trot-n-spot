FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/receipts/package.json services/receipts/package.json
COPY packages/receipt-model/package.json packages/receipt-model/package.json
RUN npm ci --workspace=@bowl/server --workspace=@bowl/shared --include-workspace-root=false --no-audit --no-fund
COPY services/receipts services/receipts
COPY packages/receipt-model packages/receipt-model
USER node
WORKDIR /app/services/receipts
EXPOSE 3001
CMD ["node","--import","tsx","src/main.ts"]
