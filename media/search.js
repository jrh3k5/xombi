import { clearUserState, setUserState, USER_STATE_MOVIE_SEARCHING, USER_STATE_TV_SEARCHING } from "../state/user_state.js";

// searchMovies executes a movie search for the given HandlerContext
export async function searchMovies(ombiClient, handlerContext) {
    const senderAddress = handlerContext.message.senderAddress;
    const searchTerm = handlerContext.message.content.substring(6);
    let movieResults = await ombiClient.searchMovies(senderAddress, searchTerm);
    if (movieResults.length > 5) {
        movieResults = movieResults.splice(0, 5);
    }

    if (movieResults.length == 0) {
        handlerContext.reply("No results found for the given search");
        clearUserState();
        return;
    }

    let responseText = `Your search returned ${movieResults.length} results:\n`
    movieResults.forEach((movieResult, movieResultIndex) => {
        responseText += `\n${movieResultIndex + 1}. ${movieResult.name}`
    })
    responseText += "\n\nJust send me the number of the movie you'd like me search for and I'll queue it up!"
    await handlerContext.reply(responseText);
    
    setUserState(senderAddress, USER_STATE_MOVIE_SEARCHING, {
        searchResults: movieResults
    });
}

// searchTV executs a TV show search for the given HandlerContext
export async function searchTV(ombiClient, handlerContext) {
    const senderAddress = handlerContext.message.senderAddress;
    const searchTerm = handlerContext.message.content.substring(3);
    let tvResults = await ombiClient.searchTV(senderAddress, searchTerm);
    if (tvResults.length > 5) {
        tvResults = tvResults.splice(0, 5);
    }

    if (tvResults.length == 0) {
        handlerContext.reply("No results found for the given search");
        clearUserState();
        return;
    }

    let responseText = `Your search returned ${tvResults.length} results:\n`
    tvResults.forEach((tvResult, movieResultIndex) => {
        responseText += `\n${movieResultIndex + 1}. ${tvResult.name}`
    })
    responseText += "\n\nJust send me the number of the show you'd like me search for and I'll queue it up!";
    responseText += "\n\nPlease note that this will enqueue ALL seasons for the selected show.";
    await handlerContext.reply(responseText);
    
    setUserState(senderAddress, USER_STATE_TV_SEARCHING, {
        searchResults: tvResults
    });
}