import { OmbiClient } from "../ombi/client";
import { searchMovies, searchTV } from "./search.js";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";

describe("search.ts", () => {
  let ombiClient: OmbiClient;
  let senderAddress: `0x${string}`;
  let message: Partial<DecodedMessage<string>>;
  let conversation: Partial<Dm> & { send: jest.Mock };

  beforeEach(() => {
    ombiClient = {
      requestMovie: jest.fn().mockResolvedValue(undefined),
      requestTV: jest.fn().mockResolvedValue(undefined),
      searchMovies: jest
        .fn()
        .mockResolvedValue([
          { id: 1, title: "Movie", getListText: () => "Movie" },
        ]),
      searchTV: jest
        .fn()
        .mockResolvedValue([
          { id: 2, title: "Show", getListText: () => "Show" },
        ]),
    };
    senderAddress = "0x1234567890abcdef1234567890abcdef12345678";
    message = { content: "search Batman" };
    conversation = { send: jest.fn() };
  });

  describe("searchMovies", () => {
    it("calls ombiClient.searchMovies with the correct search term", async () => {
      await expect(
        searchMovies(
          ombiClient,
          senderAddress,
          message as unknown as DecodedMessage<string>,
          conversation as unknown as Dm,
        ),
      ).resolves.toBeUndefined();
      expect(ombiClient.searchMovies).toHaveBeenCalledWith(
        senderAddress,
        " Batman",
      );
    });

    it("sends a message and does not call ombiClient.searchMovies if content is missing", async () => {
      message.content = undefined;
      await searchMovies(
        ombiClient,
        senderAddress,
        message as DecodedMessage<string>,
        conversation as unknown as Dm,
      );
      expect(conversation.send).toHaveBeenCalledWith(
        "Please provide a search term.",
      );
      expect(ombiClient.searchMovies).not.toHaveBeenCalled();
    });

    it("sends a message and does not call ombiClient.searchMovies if content is too short", async () => {
      message.content = "sear";
      await searchMovies(
        ombiClient,
        senderAddress,
        message as DecodedMessage<string>,
        conversation as unknown as Dm,
      );
      expect(conversation.send).toHaveBeenCalledWith(
        "Please provide a search term.",
      );
      expect(ombiClient.searchMovies).not.toHaveBeenCalled();
    });
  });

  describe("searchTV", () => {
    it("calls ombiClient.searchTV with the correct search term", async () => {
      message.content = "tv Friends";
      await expect(
        searchTV(
          ombiClient,
          senderAddress,
          message as DecodedMessage<string>,
          conversation as unknown as Dm,
        ),
      ).resolves.toBeUndefined();
      expect(ombiClient.searchTV).toHaveBeenCalledWith(
        senderAddress,
        "Friends",
      );
    });

    it("sends a message and does not call ombiClient.searchTV if content is missing", async () => {
      message.content = undefined;
      await searchTV(
        ombiClient,
        senderAddress,
        message as DecodedMessage<string>,
        conversation as unknown as Dm,
      );
      expect(conversation.send).toHaveBeenCalledWith(
        "Please provide a search term.",
      );
      expect(ombiClient.searchTV).not.toHaveBeenCalled();
    });

    it("sends a message and does not call ombiClient.searchTV if content is too short", async () => {
      message.content = "t";
      await searchTV(
        ombiClient,
        senderAddress,
        message as DecodedMessage<string>,
        conversation as unknown as Dm,
      );
      expect(conversation.send).toHaveBeenCalledWith(
        "Please provide a search term.",
      );
      expect(ombiClient.searchTV).not.toHaveBeenCalled();
    });
  });
});
