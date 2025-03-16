import { ListableResult } from "../ombi/model";

const userStates = new Map<string, UserState>();

class UserState {
  state: UserSearchState;
  context: UserStateContext | null;

  constructor() {
    this.state = UserSearchState.UNSPECIFIED;
    this.context = null;
  }
}

// UserStateContext is the context associated with a user's current state
export class UserStateContext {
  searchResults: ListableResult[];
}

// UserSearchState enumerates the possible search states in which a user exists.
export enum UserSearchState {
  UNSPECIFIED, // no user state is specified
  MOVIE, // the user is searching for a movie
  TV, // the user is searching for a TV series
}

// clearUserState clears the user's current state
export function clearUserState(address: `0x${string}`): void {
  userStates.delete(address);
}

// getUserState gets the user's current state and the associated context
export function getUserState(
  address: string,
): [UserSearchState, UserStateContext | null] {
  const userState = userStates.get(address);
  if (!userState) {
    return [UserSearchState.UNSPECIFIED, null];
  }
  return [userState.state, userState.context];
}

// setUserState sets the user's current state
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
