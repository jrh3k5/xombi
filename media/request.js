import { USER_STATE_MOVIE_SEARCHING, USER_STATE_TV_SEARCHING, clearUserState, getUserState } from "../state/user_state.js";
import { MovieAlreadyRequestedError, ShowAlreadyRequestedError } from '../ombi/errors.js'

// requestMovie submits a request for a movie based on the selection within the given HandlerContext.
export async function requestMovie(ombiClient, handlerContext) {
    const senderAddress = handlerContext.message.senderAddress;

    const selectedMovie = getSelectedSearchResult(handlerContext, USER_STATE_MOVIE_SEARCHING);
    try {
        await ombiClient.requestMovie(senderAddress, selectedMovie);
    } catch(error) {
        if (error === MovieAlreadyRequestedError) {
            handlerContext.reply("That movie has already been requested.");
            return
        }

        throw error;
    }

    await handlerContext.reply(`Your request for '${selectedMovie.getListText()}' has been enqueued!`);

    clearUserState(senderAddress);
}

// requestTV submits a request to enqueue the TV show based on the selection within the given HandlerContext.
export async function requestTV(ombiClient, handlerContext) {
    const senderAddress = handlerContext.message.senderAddress;

    const selectedShow = getSelectedSearchResult(handlerContext, USER_STATE_TV_SEARCHING);
    try {
        await ombiClient.requestTV(senderAddress, selectedShow);
    } catch(error) {
        if (error === ShowAlreadyRequestedError) {
            handlerContext.reply("That TV show has already been requested.");
            return
        }

        throw error;
    }

    await handlerContext.reply(`Your request for '${selectedShow.getListText()}' has been enqueued!`);

    clearUserState(senderAddress);
}

function getSelectedSearchResult(handlerContext, requiredState) {
    const sentMessage = handlerContext.message.content;
    if (!/^[0-9]+$/.test(sentMessage)) {
        throw 'Invalid input for submitting a request';
    }

    const senderAddress = handlerContext.message.senderAddress;
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
