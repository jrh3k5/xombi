import { ListableResult } from "../ombi/model.js";
import {
  clearUserState,
  setUserState,
  UserSearchState,
} from "../state/user_state.js";
import { OmbiClient } from "../ombi/client.js";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";

/**
 * Search for movies using Ombi and display results to the user.
 * Updates user state with search results for subsequent selection.
 * @param ombiClient The Ombi client for performing searches
 * @param senderAddress The wallet address of the user performing the search
 * @param searchTerm The movie title or keywords to search for
 * @param conversation The XMTP conversation for sending results
 * @throws Error if the search fails or returns invalid results
 */
export async function searchMovies(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
): Promise<void> {
  if (!message.content || message.content.length < 6) {
    await conversation.send("Please provide a search term.");
    return;
  }

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

/**
 * Search for TV shows using Ombi and display results to the user.
 * Updates user state with search results for subsequent selection.
 * @param ombiClient The Ombi client for performing searches
 * @param senderAddress The wallet address of the user performing the search
 * @param searchTerm The TV show title or keywords to search for
 * @param conversation The XMTP conversation for sending results
 * @throws Error if the search fails or returns invalid results
 */
export async function searchTV(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
): Promise<void> {
  if (!message.content || message.content.length < 3) {
    await conversation.send("Please provide a search term.");
    return;
  }

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

/**
 * Formats and displays the given search results into the given conversation.
 * @param senderAddress The address of the user who originally submitted the search.
 * @param conversation The conversation to which the search results are to be sent.
 * @param searchResults The results to be formatted and sent to the conversation.
 * @param endState The state into which the user is to be placed within internal tracking.
 * @param suffixStrings Any text to be shown in the message after the formatted search results.
 * @returns A Promise that will resolve upon completion.
 */
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
