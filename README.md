# xombi

xombi (pronounced "zombie") is an XMTP bot that allows you to interface with your [Ombi](https://ombi.io/) instance.

This is intended to be ran internally within your network with visibility to your Ombi instance, allowing you to remotely search for and enqueue movies without exposing Ombi to the internet.

This operates based on an allow list of wallet addresses, relying on Ethereum private key authentication to secure your requests. Each allow-listed address must be mapped to a username known to Ombi; this does not allow 'anonymous' requests.

## Prerequisites

This project requires Node >= 20.0.0.

This works only with the XMTPv3 network.

## Installation

Within GitHub, click the green "Code" button and select the "Download ZIP" option.

Extract the contents of the ZIP file to a location of your choice.

From there, follow [Usage](#usage), below, for instructions on how to run it.

## Usage

### Configuration

This project requires some setup before it can be ran.

To start, create a `.env` file that looks like the following:

```
ALLOW_LIST=<comma-separated list of addresses that can talk to the bot>
XMTP_ENV=production
XOMBI_SIGNER_KEY=<private key of the signer, expressed as a 0x... string>
XMTP_ENCRYPTION_KEY=<encryption key used to secure local storage, expressed as a 0x... string>
OMBI_API_KEY=<your Ombi instance's API key>
OMBI_API_URL=<the URL at which your Ombi instance resides>
USERNAME_<allowlisted address>=<username to be mapped to allowlisted address>
```

Caveats:

- This bot, presently, _only_ works with Ethereum identities; as such, all references to an address are assumed to be an _Ethereum_ address
  - Consequently, `XMTP_SIGNER_KEY` _must_ be a private key that can be used for signing requests on an Ethereum network
- `XMTP_ENCRYPTION_KEY` is used to local storage security and does not have the signer key's Ethereum requirements. As such, it can be generated using `openssl rand -hex 32`.
- The addresses in `ALLOW_LIST` and each `USERNAME_*` entry should all be lower-cased.
  - For example, if you have address `0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97` mapped to a user known to Ombi as `user@ombirequestor.net`, the entry should look like:

```
USERNAME_0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97=user@ombirequestor.net
```

#### Optional Configuration

Optionally, you can add:

```
DEBUG_OMBI_SEARCH=true
```

...this will enable debug logging of the responses received from Ombi.

By default, the bot will generate a random private key; if you want the bot to accept messages at a particular address, provide a private key as the `KEY` environmental variable.

### Running the Service

Once the steps in [Configuration](#configuration) have been set up, run:

```
npx tsx index.ts
```

Following that, send `help` to the bot for instructions on how to interact with it.

#### Running Project Locally

This project provides a Docker setup that can be used to run the bot with its own Ombi instance using Docker. This will require connecting the local Ombi instance to a Plex server.

This requires manual setup of the Ombi instance first, so run this command first to start Ombi:

```
docker compose up ombi -d
```

Once it's running, navigate to http://localhost:9753 to set up Ombi. Once it's set up, obtain the Ombi API key from [here](http://localhost:9753/Settings/Ombi). Take note, also, of the user [here](http://localhost:9753/usermanagement) you want the bot to send your requests as to Ombi.

Once you have the API key, create a `.env` file like so:

```
ALLOW_LIST=<your wallet address>
XOMBI_SIGNER_KEY=<the private key to be used by Xombi to sign XMTP messages>
OMBI_API_KEY=<your Ombi API key>
OMBI_API_URL=http://ombi:3579
USERNAME_<your wallet address>=<your username as it appears in Ombi>
```

Then run:

```
docker compose up -d
```

This will start the bot on top of the Ombi instance already running.
