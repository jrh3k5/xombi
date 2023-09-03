import { searchMovies } from "./search.js";

const userStates = new Map();

// triageCurrentStep is used to, based on the given sender address and the current state of that sender's
// workflow, return an async no-arg function that can be invoked.
export function triageCurrentStep(handlerContext) {
    const senderAddress = handlerContext.message.senderAddress;
    const sentContent = handlerContext.message.content.toLowerCase();

    switch (true) {
        case sentContent === "help":
            return async function() {
                handlerContext.reply("To search for a movie, send 'movie <search terms>' to me");
            };
        case sentContent.startsWith("movie "):
            return async function() {
                await searchMovies(handlerContext);
            };
        default:
            return async function() {
                handlerContext.reply("Sorry, I don't know what to do with that.");
            };
    }
}