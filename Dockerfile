# Force x64 architecture because XMTP's native bindings on ARM break on Raspberry Pi
FROM --platform=linux/amd64 node:24

WORKDIR /home/node/app
RUN chmod 777 -R /home/node/app

COPY ./ ./

RUN npm ci && npm run build

# Run the compiled JavaScript for portability (no TypeScript runtime needed)
CMD ["node", "dist/index.js"]
