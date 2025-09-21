import {
  clearUserState,
  getUserState,
  setUserState,
  UserSearchState,
  UserStateContext,
} from "./user_state.js";

describe("user_state module", () => {
  const address = "0xabc" as `0x${string}`;

  afterEach(() => {
    clearUserState(address);
  });

  it("returns UNSPECIFIED and null context for unknown user", () => {
    expect(getUserState(address)).toEqual([UserSearchState.UNSPECIFIED, null]);
  });

  it("can set and get user state and context", () => {
    const context = new UserStateContext();
    context.searchResults = [{ getListText: () => "result" }];
    setUserState(address, UserSearchState.MOVIE, context);
    const [state, ctx] = getUserState(address);
    expect(state).toBe(UserSearchState.MOVIE);
    expect(ctx).not.toBeNull();
    expect(ctx?.searchResults.length).toBe(1);
    expect(ctx?.searchResults[0].getListText()).toBe("result");
  });

  it("can clear user state", () => {
    setUserState(address, UserSearchState.TV, new UserStateContext());
    clearUserState(address);
    expect(getUserState(address)).toEqual([UserSearchState.UNSPECIFIED, null]);
  });

  it("overwrites previous state and context", () => {
    setUserState(address, UserSearchState.MOVIE, new UserStateContext());
    const context2 = new UserStateContext();
    context2.searchResults = [{ getListText: () => "tv" }];
    setUserState(address, UserSearchState.TV, context2);
    const [state, ctx] = getUserState(address);
    expect(state).toBe(UserSearchState.TV);
    expect(ctx?.searchResults[0].getListText()).toBe("tv");
  });
});
