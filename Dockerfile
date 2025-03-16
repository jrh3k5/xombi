FROM node:20

WORKDIR /home/node/app
RUN chmod 777 -R /home/node/app

COPY ./ ./

RUN npm install

CMD ["npx", "tsx", "index.ts"]