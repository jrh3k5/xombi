import { getUserState } from "../state/user_state.js";
import { newClient } from "../ombi/client.js";

const ombiClient = newClient();

export async function requestMovie(handlerContext) {
    const sentMessage = handlerContext.message.content;
    if (!/^[0-9]+$/.test(sentMessage)) {
        throw 'Invalid input for submitting a movie request';
    }

    const senderAddress = handlerContext.message.senderAddress;
    const [_, stateContext] = getUserState(senderAddress);
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

    const selectedMovie = searchResults[selectedIndex];
    await ombiClient.requestMovie(senderAddress, selectedMovie);

    handlerContext.reply(`Your request for '${selectedMovie.name}' (${selectedMovie.releaseDate.getUTCFullYear()}) has been enqueued!`);
}