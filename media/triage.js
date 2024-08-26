import { USER_STATE_MOVIE_SEARCHING, USER_STATE_TV_SEARCHING, getUserState } from "../state/user_state.js";
import { requestMovie, requestTV } from "./request.js";
import { searchMovies, searchTV } from "./search.js";

// triageCurrentStep is used to, based on the given sender address and the current state of that sender's
// workflow, return an async no-arg function that can be invoked.
export function triageCurrentStep(ombiClient, message) {
    const senderAddress = message.senderAddress;
    const sentContent = message.content.toLowerCase();

    switch (true) {
        case sentContent === "help":
            return async function() {
                message.conversation.send("To search for a movie, send 'movie <search terms>' to me; for TV shows, send 'tv <search terms>'");
            };
        case sentContent.startsWith("movie "):
            return async function() {
                await searchMovies(ombiClient, message);
            };
        case sentContent.startsWith("tv "):
            return async function() {
                await searchTV(ombiClient, message);
            };
        default:
            const [currentState, _] = getUserState(senderAddress);
            // if there's no current state, fall through to default
            if (currentState) {
                switch(currentState) {
                    case USER_STATE_MOVIE_SEARCHING:
                        return async () => {
                            await requestMovie(ombiClient, message);
                        };
                    case USER_STATE_TV_SEARCHING:
                        return async () => {
                            await requestTV(ombiClient, message);
                        }
                }
            }

            return async function() {
                message.conversation.send("Sorry, I don't know what to do with that.");
            };
    }
}