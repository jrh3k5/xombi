# Use Ubuntu rather than a Node base image because XMTP v6.0.0 requires
# GLIBC_2.38, and the base OS for the Node images does not meet that need
FROM ubuntu:24.04

WORKDIR /home/node/app
RUN chmod 777 -R /home/node/app

COPY ./ ./

# Add the user to run Node as
RUN useradd -ms /bin/bash node

# Install Node
RUN apt-get update
RUN apt-get install npm nodejs -y

RUN npm ci && npm run build

# Run the compiled JavaScript for portability (no TypeScript runtime needed)
CMD ["node", "dist/index.js"]
