import { requestMovie, requestTV } from "./request.js";
import { UserSearchState } from "../state/user_state.js";
import {
  MovieAlreadyRequestedError,
  NoRequestPermissions,
  ShowAlreadyRequestedError,
} from "../ombi/errors.js";
import { MovieSearchResult, TVSearchResult } from "../ombi/model.js";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";

// Use module object for jest.spyOn
import * as getUserStateModule from "../state/user_state.js";
import { OmbiClient } from "../ombi/client.js";

describe("requestMovie", () => {
  const senderAddress = "0xabc" as `0x${string}`;
  const movie = new MovieSearchResult("1", "The Matrix");
  let ombiClient: jest.Mocked<OmbiClient>;
  let conversation: jest.Mocked<Dm>;
  let message: jest.Mocked<DecodedMessage<string>>;

  beforeEach(() => {
    ombiClient = {
      requestMovie: jest.fn(),
      requestTV: jest.fn(),
      searchMovies: jest.fn(),
      searchTV: jest.fn(),
    };
    conversation = { sendText: jest.fn() } as unknown as jest.Mocked<Dm>;
    message = { content: "1" } as unknown as jest.Mocked<
      DecodedMessage<string>
    >;
    // Mock getUserState to return correct state and searchResults
    jest
      .spyOn(getUserStateModule, "getUserState")
      .mockReturnValue([UserSearchState.MOVIE, { searchResults: [movie] }]);
    jest
      .spyOn(getUserStateModule, "clearUserState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enqueues a movie request and notifies the user", async () => {
    await requestMovie(ombiClient, senderAddress, message, conversation);
    expect(ombiClient.requestMovie).toHaveBeenCalledWith(senderAddress, movie);
    expect(conversation.sendText).toHaveBeenCalledWith(
      "Your request for 'The Matrix' has been enqueued!",
    );
  });

  it("handles MovieAlreadyRequestedError", async () => {
    ombiClient.requestMovie.mockRejectedValueOnce(
      new MovieAlreadyRequestedError(""),
    );
    await requestMovie(ombiClient, senderAddress, message, conversation);
    expect(conversation.sendText).toHaveBeenCalledWith(
      "That movie has already been requested.",
    );
  });

  it("handles NoRequestPermissions error", async () => {
    ombiClient.requestMovie.mockRejectedValueOnce(new NoRequestPermissions(""));
    await requestMovie(ombiClient, senderAddress, message, conversation);
    expect(conversation.sendText).toHaveBeenCalledWith(
      "You do not have permission to request a movie.",
    );
  });

  it("throws other errors", async () => {
    ombiClient.requestMovie.mockRejectedValueOnce(new Error("fail"));
    await expect(
      requestMovie(ombiClient, senderAddress, message, conversation),
    ).rejects.toThrow("fail");
  });
});

describe("requestTV", () => {
  const senderAddress = "0xabc" as `0x${string}`;
  const show = new TVSearchResult(
    "1",
    "Lost",
    new Date("2025-01-01"),
    6,
    "Ended",
  );
  let ombiClient: jest.Mocked<OmbiClient>;
  let conversation: jest.Mocked<Dm>;
  let message: jest.Mocked<DecodedMessage<string>>;

  beforeEach(() => {
    ombiClient = {
      requestMovie: jest.fn(),
      requestTV: jest.fn(),
      searchMovies: jest.fn(),
      searchTV: jest.fn(),
    };
    conversation = { sendText: jest.fn() } as unknown as jest.Mocked<Dm>;
    message = { content: "1" } as unknown as jest.Mocked<
      DecodedMessage<string>
    >;
    jest
      .spyOn(getUserStateModule, "getUserState")
      .mockReturnValue([UserSearchState.TV, { searchResults: [show] }]);
    jest
      .spyOn(getUserStateModule, "clearUserState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enqueues a TV show request and notifies the user", async () => {
    await requestTV(ombiClient, senderAddress, message, conversation);
    expect(ombiClient.requestTV).toHaveBeenCalledWith(senderAddress, show);
    expect(conversation.sendText).toHaveBeenCalledWith(
      "Your request for 'Lost (2025) (6 seasons, Ended)' has been enqueued!",
    );
  });

  it("handles ShowAlreadyRequestedError", async () => {
    ombiClient.requestTV.mockRejectedValueOnce(
      new ShowAlreadyRequestedError(""),
    );
    await requestTV(ombiClient, senderAddress, message, conversation);
    expect(conversation.sendText).toHaveBeenCalledWith(
      "That TV show has already been requested.",
    );
  });

  it("handles NoRequestPermissions error", async () => {
    ombiClient.requestTV.mockRejectedValueOnce(new NoRequestPermissions(""));
    await requestTV(ombiClient, senderAddress, message, conversation);
    expect(conversation.sendText).toHaveBeenCalledWith(
      "You do not have permission to request a show.",
    );
  });

  it("throws other errors", async () => {
    ombiClient.requestTV.mockRejectedValueOnce(new Error("fail"));
    await expect(
      requestTV(ombiClient, senderAddress, message, conversation),
    ).rejects.toThrow("fail");
  });
});
