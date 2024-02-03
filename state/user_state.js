const userStates = new Map();

export const USER_STATE_MOVIE_SEARCHING = "movie_searching";
export const USER_STATE_TV_SEARCHING = "tv_searching";

// clearUserState clears the user's current state
export function clearUserState(address) {
    userStates.set(address, null);
}

// getUserState gets the user's current state and the associated context
export function getUserState(address) {
    const userState = userStates.get(address);
    if (!userState) {
        return [null, null];
    }
    return [userState.state, userState.context];
}

// setUserState sets the user's current state
export function setUserState(address, state, context) {
    userStates.set(address, {
        state: state,
        context: context
    });
}