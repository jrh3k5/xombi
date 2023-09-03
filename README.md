# xombi

xombi (pronounced "zombie") is an XMTP bot that allows you to interface with your [Ombi](https://ombi.io/) instance.

This is intended to be ran internally within your network with visibility to your Ombi instance, allowing you to remotely search for and enqueue movies without exposing Ombi to the internet.

This operates based on an allow list of wallet addresses, relying on Ethereum private key authentication to secure your requests. Each allow-listed address must be mapped to a username known to Ombi; this does not allow 'anonymous' requests.

## Prerequisites

This project requires Node >= 18.0.0.

## Installation

Within GitHub, click the green "Code" button and select the "Download ZIP" option.

Extract the contents of the ZIP file to a location of your choice.

From there, follow [Usage](#usage), below, for instructions on how to run it.

## Usage

Create a `.env` file that looks like the following:

```
ALLOW_LIST=<comma-separated list of addresses that can talk to the bot>
ENV=production
KEY=<optional private key>
OMBI_API_KEY=<your Ombi instance's API key>
OMBI_API_URL=<the URL at which your Ombi instance resides>
USERNAME_<allowlisted address>=<username to be mapped to allowlisted address>
```

By default, the bot will generate a random private key; if you want the bot to accept messages at a particular address, provide a private key as the `KEY` environmental variable.

Once that's set up, run:

```
node index.js
```

Following that, send `help` to the bot for instructions on how to interact with it.