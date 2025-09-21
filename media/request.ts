import {
  UserSearchState,
  clearUserState,
  getUserState,
} from "../state/user_state.js";
import {
  MovieAlreadyRequestedError,
  NoRequestPermissions,
  ShowAlreadyRequestedError,
} from "../ombi/errors.js";
import { OmbiClient } from "../ombi/client.js";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";
import {
  ListableResult,
  MovieSearchResult,
  TVSearchResult,
} from "../ombi/model.js";
import { RequestTracker } from "../webhook/server.js";

/**
 * Submit a movie request to Ombi based on the user's selection.
 * Handles error cases and tracks the request for webhook notifications.
 * @param ombiClient The Ombi client for making requests
 * @param senderAddress The wallet address of the user making the request
 * @param message The XMTP message containing the user's selection
 * @param conversation The XMTP conversation for sending responses
 * @param requestTracker Optional tracker for webhook notifications
 * @throws Error if the request fails for reasons other than already requested or no permissions
 */
export async function requestMovie(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
  requestTracker?: RequestTracker,
): Promise<void> {
  const selectedMovie = getSelectedSearchResult<MovieSearchResult>(
    senderAddress,
    message,
    UserSearchState.MOVIE,
  );
  try {
    await ombiClient.requestMovie(senderAddress, selectedMovie);
  } catch (error) {
    if (error instanceof MovieAlreadyRequestedError) {
      await conversation.send("That movie has already been requested.");
      return;
    } else if (error instanceof NoRequestPermissions) {
      await conversation.send("You do not have permission to request a movie.");
      return;
    }

    throw error;
  }

  // Track the request for webhook notifications
  if (requestTracker) {
    requestTracker.trackRequest(selectedMovie.getId(), "movie", senderAddress);
  }

  await conversation.send(
    `Your request for '${selectedMovie.getListText()}' has been enqueued!`,
  );

  clearUserState(senderAddress);
}

/**
 * Submit a TV show request to Ombi based on the user's selection.
 * Handles error cases and tracks the request for webhook notifications.
 * @param ombiClient The Ombi client for making requests
 * @param senderAddress The wallet address of the user making the request
 * @param message The XMTP message containing the user's selection
 * @param conversation The XMTP conversation for sending responses
 * @param requestTracker Optional tracker for webhook notifications
 * @throws Error if the request fails for reasons other than already requested or no permissions
 */
export async function requestTV(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
  requestTracker?: RequestTracker,
): Promise<void> {
  const selectedShow = getSelectedSearchResult<TVSearchResult>(
    senderAddress,
    message,
    UserSearchState.TV,
  );
  try {
    await ombiClient.requestTV(senderAddress, selectedShow);
  } catch (error) {
    if (error instanceof ShowAlreadyRequestedError) {
      await conversation.send("That TV show has already been requested.");
      return;
    } else if (error instanceof NoRequestPermissions) {
      await conversation.send("You do not have permission to request a show.");
      return;
    }

    throw error;
  }

  // Track the request for webhook notifications
  if (requestTracker) {
    requestTracker.trackRequest(selectedShow.getId(), "tv", senderAddress);
  }

  await conversation.send(
    `Your request for '${selectedShow.getListText()}' has been enqueued!`,
  );

  clearUserState(senderAddress);
}

function getSelectedSearchResult<R extends ListableResult>(
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  requiredState: UserSearchState,
): R {
  const sentMessage = message.content;
  if (!/^[0-9]+$/.test(sentMessage ?? "")) {
    throw "Invalid input for submitting a request";
  }

  const [userState, stateContext] = getUserState(senderAddress);

  if (userState !== requiredState) {
    throw `Unexpected user state: ${userState}`;
  }

  if (!stateContext) {
    throw "No state context available";
  }

  const searchResults = stateContext.searchResults as ListableResult[];
  if (!searchResults) {
    throw "No search results found in state context";
  }

  const selectedIndex = parseInt(sentMessage ?? "") - 1;
  if (selectedIndex >= searchResults.length) {
    throw `Invalid selection index; index was ${selectedIndex}, but there are ${searchResults.length} search results`;
  }

  const asR = searchResults[selectedIndex] as R;
  if (!asR) {
    throw `Invalid search result at index ${selectedIndex}: ${searchResults[selectedIndex]}`;
  }

  return asR;
}
