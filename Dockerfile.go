# syntax=docker/dockerfile:1

# --- Build Stage ---
# using golang:1.21-alpine as base image
FROM golang:1.21-alpine AS build

WORKDIR /app

# Copy Go module files and download dependencies
COPY go_container_src/go.mod ./
RUN go mod download

# Copy Go source code
COPY go_container_src/*.go ./

# Build static Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /server

# --- Runtime Stage ---
# using scratch as base image
FROM scratch
COPY --from=build /server /server
EXPOSE 8080
CMD ["/server"]