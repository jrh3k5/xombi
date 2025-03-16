import { UserSearchState, getUserState } from "../state/user_state.js";
import { requestMovie, requestTV } from "./request.js";
import { searchMovies, searchTV } from "./search.js";
import { OmbiClient } from "../ombi/client";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";

// triageCurrentStep is used to, based on the given sender address and the current state of that sender's
// workflow, return an async no-arg function that can be invoked.
export async function triageCurrentStep(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
): Promise<void> {
  const sentContent = message.content.toLowerCase();

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
          await requestMovie(ombiClient, senderAddress, message, conversation);

          return;
        case UserSearchState.TV:
          await requestTV(ombiClient, senderAddress, message, conversation);

          return;
      }
    }

    await conversation.send("Sorry, I don't know what to do with that.");
  }
}
