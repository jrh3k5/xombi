# xombi

xombi is an XMTP bot that allows you to interface with your [Ombi](https://ombi.io/) instance.

## Prerequisites

This project requires Node >= 18.0.0.

## Usage

Create a `.env` file that looks like the following:

```
KEY=<optional private key>
ENV=production
```

By default, the bot will generate a random private key; if you want the bot to accept messages at a particular address, provide a private key as the `KEY` environmental variable.

Once that's set up, run:

```
node index.js
```