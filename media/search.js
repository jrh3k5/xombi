import { clearUserState, setUserState, USER_STATE_MOVIE_SEARCHING } from "../state/user_state.js";

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
        responseText += `\n${movieResultIndex + 1}. ${movieResult.name} (${movieResult.releaseDate.getUTCFullYear()})`
    })
    responseText += "\n\nJust send me the number of the movie you'd like me search for and I'll queue it up!"
    handlerContext.reply(responseText);
    
    setUserState(senderAddress, USER_STATE_MOVIE_SEARCHING, {
        searchResults: movieResults
    });
}