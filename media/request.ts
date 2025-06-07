import {
  UserSearchState,
  clearUserState,
  getUserState,
} from "../state/user_state";
import {
  MovieAlreadyRequestedError,
  NoRequestPermissions,
  ShowAlreadyRequestedError,
} from "../ombi/errors";
import { OmbiClient } from "../ombi/client";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";
import {
  ListableResult,
  MovieSearchResult,
  TVSearchResult,
} from "../ombi/model";

// requestMovie submits a request for a movie based on the selection within the given message.
export async function requestMovie(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
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

  await conversation.send(
    `Your request for '${selectedMovie.getListText()}' has been enqueued!`,
  );

  clearUserState(senderAddress);
}

// requestTV submits a request to enqueue the TV show based on the selection within the given message.
export async function requestTV(
  ombiClient: OmbiClient,
  senderAddress: `0x${string}`,
  message: DecodedMessage<string>,
  conversation: Dm,
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
