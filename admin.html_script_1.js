
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/service-worker.js").catch(function (error) {
          console.log("Service Worker registration failed:", error);
        });
      });
    }
  