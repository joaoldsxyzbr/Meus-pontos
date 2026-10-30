import { mount } from "svelte";
import App from "./App.svelte";
import "../../public/styles.css";

const target = document.getElementById("app");
if (!target) throw new Error("Elemento principal do aplicativo não encontrado.");
mount(App, { target });
