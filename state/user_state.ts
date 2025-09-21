import { ListableResult } from "../ombi/model.js";

const userStates = new Map<string, UserState>();

class UserState {
  state: UserSearchState;
  context: UserStateContext | null;

  constructor() {
    this.state = UserSearchState.UNSPECIFIED;
    this.context = null;
  }
}

/**
 * Context data associated with a user's current workflow state.
 * Contains search results and other state-specific information.
 */
export class UserStateContext {
  searchResults: ListableResult[] = [];
}

/**
 * Enum representing the different states a user can be in during their workflow.
 * Used to track progress through search and selection processes.
 */
export enum UserSearchState {
  UNSPECIFIED, // no user state is specified
  MOVIE, // the user is searching for a movie
  TV, // the user is searching for a TV series
}

/**
 * Clear all state and context for a user.
 * @param address The wallet address of the user
 */
export function clearUserState(address: `0x${string}`): void {
  userStates.delete(address);
}

/**
 * Get the current state and context for a user's workflow.
 * @param address The wallet address of the user
 * @returns Tuple of [current state, state context or null]
 */
export function getUserState(
  address: string,
): [UserSearchState, UserStateContext | null] {
  const userState = userStates.get(address);
  if (!userState) {
    return [UserSearchState.UNSPECIFIED, null];
  }
  return [userState.state, userState.context];
}

/**
 * Set the state and context for a user's workflow.
 * @param address The wallet address of the user
 * @param state The new state to set
 * @param context Optional context data to associate with the state
 */
export function setUserState(
  address: string,
  state: UserSearchState,
  context: UserStateContext | null,
): void {
  userStates.set(address, {
    state: state,
    context: context,
  });
}
