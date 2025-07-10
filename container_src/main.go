package main

// main.go
//`net/http package already acts like a minimal web framework.

import (
	"encoding/json"
	"net/http"
)

type ApiResponse struct {
	Message string `json:"message"`
	Value   int    `json:"value"`
}

func apiHandler(message string, value int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(ApiResponse{Message: message, Value: value})
	}
}

func responseHeadersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	headers := map[string]string{}
	for k, v := range r.Header {
		headers[k] = v[0]
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"headers": headers})
}

func fib(n int) int {
	if n <= 1 {
		return n
	}
	return fib(n-1) + fib(n-2)
}

func heavyComputeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	// Dummy heavy computation: calculate a large Fibonacci number
	n := 40
	result := fib(n)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Heavy compute done from Container!",
		"fib": result,
		"n": n,
	})
}

func main() {
	http.HandleFunc("/api/api1", apiHandler("From Container!", 101))
	http.HandleFunc("/api/heavycompute", heavyComputeHandler)
	http.HandleFunc("/api/responseheaders", responseHeadersHandler)
	http.ListenAndServe(":8080", nil)
} 