package main

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

func main() {
	http.HandleFunc("/api/api1", apiHandler("This is API 1!", 101))
	http.HandleFunc("/api/api2", apiHandler("This is API 2!", 202))
	http.HandleFunc("/api/api3", apiHandler("This is API 3!", 303))
	http.ListenAndServe(":8080", nil)
} 