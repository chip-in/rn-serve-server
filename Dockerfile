FROM node:16-alpine

ENV CI_HOME /usr/local/chip-in

RUN apk --update add pcre-dev openssl-dev curl git \
  &&  mkdir -p ${CI_HOME}/ 
  
COPY . ${CI_HOME}/rn-contents-server

RUN cd ${CI_HOME}/rn-serve-server \
  && npm i \
  && npm run cleanbuild \
  && ln -s ${CI_HOME}/rn-serve-server ${CI_HOME}/rn-contents-server

WORKDIR ${CI_HOME}/rn-serve-server

ENTRYPOINT ["npm", "start", "--"]

