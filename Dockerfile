# Base image; platform is selected by the builder (buildx can target amd64/arm64)
FROM node:24

WORKDIR /home/node/app
RUN chmod 777 -R /home/node/app

COPY ./ ./

RUN npm ci && npm run build

# Run the compiled JavaScript for portability (no TypeScript runtime needed)
CMD ["node", "dist/index.js"]
