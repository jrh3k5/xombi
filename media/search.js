import { clearUserState, setUserState, USER_STATE_MOVIE_SEARCHING, USER_STATE_TV_SEARCHING } from "../state/user_state.js";

// searchMovies executes a movie search for the given message
export async function searchMovies(ombiClient, message) {
    const senderAddress = message.senderAddress;
    const searchTerm = message.content.substring(6);
    const movieResults = await ombiClient.searchMovies(senderAddress, searchTerm);
    await showSearchResults(message, movieResults, USER_STATE_MOVIE_SEARCHING);
}

// searchTV executs a TV show search for the given message
export async function searchTV(ombiClient, message) {
    const senderAddress = message.senderAddress;
    const searchTerm = message.content.substring(3);
    const tvResults = await ombiClient.searchTV(senderAddress, searchTerm);
    await showSearchResults(message, tvResults, USER_STATE_TV_SEARCHING, [
        "Please note that this will enqueue ALL seasons for the selected show."
    ]);
}

async function showSearchResults(message, searchResults, endState, suffixStrings) {
    if (searchResults.length > 5) {
        searchResults = searchResults.splice(0, 5);
    }

    if (searchResults.length == 0) {
        message.conversation.send("No results found for the given search");
        clearUserState();
        return;
    }

    let responseText = `Your search returned ${searchResults.length} results:\n`
    searchResults.forEach((searchResult, searchResultIndex) => {
        responseText += `\n${searchResultIndex + 1}. ${searchResult.getListText()}`
    })
    responseText += "\n\nJust send me the number of the result you'd like me to get and I'll queue it up!";

    if (suffixStrings) {
        suffixStrings.forEach(suffixString => {
            responseText += `\n\n${suffixString}`;
        })
    }

    await message.conversation.send(responseText);
    
    setUserState(message.senderAddress, endState, {
        searchResults: searchResults
    });
}