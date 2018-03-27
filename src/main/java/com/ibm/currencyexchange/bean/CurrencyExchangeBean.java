package com.ibm.currencyexchange.bean;

public class CurrencyExchangeBean {
	
	private String from;
	private String to;
	private int exchangeRate;
	
	
	
	public CurrencyExchangeBean() {
		super();
		// TODO Auto-generated constructor stub
	}



	public CurrencyExchangeBean(String from, String to, int exchangeRate) {
		super();
		this.from = from;
		this.to = to;
		this.exchangeRate = exchangeRate;
	}



	public String getFrom() {
		return from;
	}



	public void setFrom(String from) {
		this.from = from;
	}



	public String getTo() {
		return to;
	}



	public void setTo(String to) {
		this.to = to;
	}



	public int getExchangeRate() {
		return exchangeRate;
	}



	public void setExchangeRate(int exchangeRate) {
		this.exchangeRate = exchangeRate;
	}
	
  
	
	
	
    
	
}
