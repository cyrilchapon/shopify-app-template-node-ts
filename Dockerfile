FROM node:18-alpine

ARG SHOPIFY_API_KEY
ENV SHOPIFY_API_KEY=$SHOPIFY_API_KEY
EXPOSE 8081
WORKDIR /app
COPY web .
RUN cd backend && yarn install
RUN cd frontend && yarn install && yarn build
WORKDIR /backend
CMD ["yarn", "serve"]
