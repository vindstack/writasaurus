declare const server: {
  fetch(request: Request, info?: Deno.ServeHandlerInfo<Deno.NetAddr>): Response | Promise<Response>;
};

export default server;
