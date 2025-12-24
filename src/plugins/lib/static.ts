import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";

export const fileImporterPlugin = (publicDir: string = "public") =>
  new Elysia({ name: "manic.static" }).use(
    staticPlugin({
      assets: publicDir,
      prefix: "/",
    })
  );
