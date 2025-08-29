import { UserSearchState, getUserState } from "../state/user_state";
import { requestMovie, requestTV } from "./request";
import { searchMovies, searchTV } from "./search";
import { OmbiClient } from "../ombi/client";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";
import { RequestTracker } from "../webhook/server";
import { UnresolvableAddressError } from "../ombi/errors";

const errorMessageUnresolvedUser =
  "There is a user mapping configuration issue. Please contact xombi's administrator for more help.\n\nUntil this is resolved, you will not be able to use xombi.";

/**
 * Triage and handle the current step in a user's workflow based on their message content and state.
 * Routes to appropriate handlers for search, request, or help functionality.
 * @param ombiClient The Ombi client for media operations
 * @param senderAddress The wallet address of the user sending the message
 * @param message The XMTP message containing the user's input
 * @param conversation The XMTP conversation for sending responses
 * @param requestTracker Optional tracker for webhook notifications
 * @throws Error if message processing fails
 */
export async function triageCurrentStep(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
  requestTracker?: RequestTracker,
): Promise<void> {
  const sentContent = message.content?.toLowerCase();
  if (!sentContent) {
    return;
  }

  if (sentContent === "help") {
    await conversation.send(
      "To search for a movie, send 'movie <search terms>' to me; for TV shows, send 'tv <search terms>'",
    );
  } else if (sentContent.startsWith("movie ")) {
    try {
      await searchMovies(ombiClient, senderAddress, message, conversation);
    } catch (err) {
      if (err instanceof UnresolvableAddressError) {
        await conversation.send(errorMessageUnresolvedUser);
      } else {
        throw err;
      }
    }
  } else if (sentContent.startsWith("tv ")) {
    try {
      await searchTV(ombiClient, senderAddress, message, conversation);
    } catch (err) {
      if (err instanceof UnresolvableAddressError) {
        await conversation.send(errorMessageUnresolvedUser);
      } else {
        throw err;
      }
    }
  } else {
    const [currentState] = getUserState(senderAddress);
    // if there's no current state, fall through to default
    if (currentState) {
      switch (currentState) {
        case UserSearchState.MOVIE:
          await requestMovie(
            ombiClient,
            senderAddress,
            message,
            conversation,
            requestTracker,
          );

          return;
        case UserSearchState.TV:
          await requestTV(
            ombiClient,
            senderAddress,
            message,
            conversation,
            requestTracker,
          );

          return;
      }
    }

    await conversation.send("Sorry, I don't know what to do with that.");
  }
}
