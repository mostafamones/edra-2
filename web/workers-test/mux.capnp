using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (services = [(name = "test", worker = (compatibilityDate = "2026-10-30", compatibilityFlags = ["nodejs_compat"], modules = [(name = "mux.mjs", esModule = embed "mux.mjs")]))]);
