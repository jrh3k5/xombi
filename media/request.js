import { USER_STATE_MOVIE_SEARCHING, USER_STATE_TV_SEARCHING, clearUserState, getUserState } from "../state/user_state.js";
import { MovieAlreadyRequestedError, NoRequestPermissions, ShowAlreadyRequestedError } from '../ombi/errors.js'

// requestMovie submits a request for a movie based on the selection within the given message.
export async function requestMovie(ombiClient, message) {
    const senderAddress = message.senderAddress;

    const selectedMovie = getSelectedSearchResult(message, USER_STATE_MOVIE_SEARCHING);
    try {
        await ombiClient.requestMovie(senderAddress, selectedMovie);
    } catch(error) {
        if (error === MovieAlreadyRequestedError) {
            message.conversation.send("That movie has already been requested.");
            return
        } else if (error == NoRequestPermissions) {
            message.conversation.send("You do not have permission to request that movie.");
            return
        }

        throw error;
    }

    await message.conversation.send(`Your request for '${selectedMovie.getListText()}' has been enqueued!`);

    clearUserState(senderAddress);
}

// requestTV submits a request to enqueue the TV show based on the selection within the given message.
export async function requestTV(ombiClient, message) {
    const senderAddress = message.senderAddress;

    const selectedShow = getSelectedSearchResult(message, USER_STATE_TV_SEARCHING);
    try {
        await ombiClient.requestTV(senderAddress, selectedShow);
    } catch(error) {
        if (error === ShowAlreadyRequestedError) {
            message.conversation.send("That TV show has already been requested.");
            return
        } else if (error == NoRequestPermissions) {
            message.conversation.send("You do not have permission to request that show.");

            return
        }

        throw error;
    }

    await message.conversation.send(`Your request for '${selectedShow.getListText()}' has been enqueued!`);

    clearUserState(senderAddress);
}

function getSelectedSearchResult(message, requiredState) {
    const sentMessage = message.content;
    if (!/^[0-9]+$/.test(sentMessage)) {
        throw 'Invalid input for submitting a request';
    }

    const senderAddress = message.senderAddress;
    const [userState, stateContext] = getUserState(senderAddress);

    if (userState !== requiredState) {
        throw `Unexpected user state: ${userState}`;
    }

    if (!stateContext) {
        throw 'No state context available';
    }

    const searchResults = stateContext.searchResults;
    if (!searchResults) {
        throw 'No search results found in state context';
    }

    const selectedIndex = parseInt(sentMessage) - 1;
    if (selectedIndex >= searchResults.length) {
        throw `Invalid selection index; index was ${selectedIndex}, but there are ${searchResults.length} search results`;
    }

    return searchResults[selectedIndex]
}
