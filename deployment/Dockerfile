FROM java:8

WORKDIR /

ADD microservice/target/currency-exchange-service-0.0.1-SNAPSHOT.jar  /opt/currency_exchange.jar

EXPOSE 8000

CMD java  -Xms210m -Xmx210m  -jar /opt/currency_exchange.jar
