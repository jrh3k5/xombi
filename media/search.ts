import { ListableResult } from "../ombi/model.ts";
import {
  clearUserState,
  setUserState,
  UserSearchState,
} from "../state/user_state.ts";
import { OmbiClient } from "../ombi/client.ts";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";

// searchMovies executes a movie search for the given message
export async function searchMovies(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
): Promise<void> {
  const searchTerm = message.content.substring(6);
  const movieResults = await ombiClient.searchMovies(senderAddress, searchTerm);
  await showSearchResults(
    senderAddress,
    conversation,
    movieResults,
    UserSearchState.MOVIE,
    [],
  );
}

// searchTV executs a TV show search for the given message
export async function searchTV(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
): Promise<void> {
  const searchTerm = message.content.substring(3);
  const tvResults = await ombiClient.searchTV(senderAddress, searchTerm);
  await showSearchResults(
    senderAddress,
    conversation,
    tvResults,
    UserSearchState.TV,
    ["Please note that this will enqueue ALL seasons for the selected show."],
  );
}

async function showSearchResults(
  senderAddress: `0x${string}`,
  conversation: Dm,
  searchResults: ListableResult[],
  endState: UserSearchState,
  suffixStrings: string[],
): Promise<void> {
  if (searchResults.length > 5) {
    searchResults = searchResults.splice(0, 5);
  }

  if (searchResults.length == 0) {
    await conversation.send("No results found for the given search");
    clearUserState(senderAddress);

    return;
  }

  let responseText = `Your search returned ${searchResults.length} results:\n`;
  searchResults.forEach((searchResult, searchResultIndex) => {
    responseText += `\n${searchResultIndex + 1}. ${searchResult.getListText()}`;
  });
  responseText +=
    "\n\nJust send me the number of the result you'd like me to get and I'll queue it up!";

  if (suffixStrings) {
    suffixStrings.forEach((suffixString) => {
      responseText += `\n\n${suffixString}`;
    });
  }

  await conversation.send(responseText);

  setUserState(senderAddress, endState, {
    searchResults: searchResults,
  });
}
