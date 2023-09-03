import { newClient } from "../ombi/client.js";

const ombiClient = newClient();

// searchMovies executes a movie search for the given HandlerContext
export async function searchMovies(handlerContext) {
    const searchTerm = handlerContext.message.content.substring(6);
    let movieResults = await ombiClient.searchMovies(handlerContext.message.senderAddress, searchTerm);
    if (movieResults.length > 5) {
        movieResults = movieResults.splice(0, 5);
    }

    if (movieResults.length == 0) {
        handlerContext.reply("No results found for the given search");
        // TODO: transition user back to initial state
        return;
    }

    let responseText = `Your search returned ${movieResults.length} results:\n`
    movieResults.forEach((movieResult, movieResultIndex) => {
        responseText += `\n${movieResultIndex + 1}. ${movieResult.name} (${movieResult.releaseDate.getUTCFullYear()})`
    })
    responseText += "\n\nJust send me the number of the movie you'd like me search for and I'll queue it up!"
    handlerContext.reply(responseText);
    // TODO: move user into a state where they can send a response
}