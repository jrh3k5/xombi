import { UserSearchState, getUserState } from "../state/user_state.js";
import { requestMovie, requestTV } from "./request.js";
import { searchMovies, searchTV } from "./search.js";
import { OmbiClient } from "../ombi/client";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";
import { RequestTracker } from "../webhook/server";

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
    await searchMovies(ombiClient, senderAddress, message, conversation);
  } else if (sentContent.startsWith("tv ")) {
    await searchTV(ombiClient, senderAddress, message, conversation);
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
