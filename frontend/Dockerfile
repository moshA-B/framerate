# frontend/Dockerfile - the recipe for the website container, in TWO stages.
#   Stage 1 ("build"): a Node image compiles our React code into plain files.
#   Stage 2: a tiny nginx image serves those files. Node is NOT in the final image.

# ---------- stage 1: build the React app ----------
FROM node:22-alpine AS build
WORKDIR /app
# Copy only the package list first: Docker then re-uses the downloaded packages
# (a cached layer) when only our own code changed, which makes rebuilds much faster.
COPY package*.json ./
RUN npm install
# Now our code, then build it. The result is in /app/dist.
COPY . .
RUN npm run build

# ---------- stage 2: serve it ----------
FROM nginx:alpine
# Our own server settings (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Take ONLY the finished files from stage 1.
COPY --from=build /app/dist /usr/share/nginx/html

# nginx listens on port 80 inside the container (compose maps it to 8080 on your PC).
EXPOSE 80
